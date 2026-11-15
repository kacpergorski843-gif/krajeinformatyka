"""Regression tests for the current Supabase payout migration in disposable local PostgreSQL.
Never connects to Supabase. Run: python3 scripts/test_activity_economy.py
"""
import json, os, shutil, subprocess, tempfile, unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MIGRATION=ROOT/"supabase/migrations/00764_restore_payouts_for_all_countries.sql"
FIXTURE="""
create role authenticated; create role anon; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
create function public.is_admin(uuid) returns boolean language sql as $$select false$$;
create table countries(id uuid primary key,balance numeric default 0,coal numeric default 20,
oil numeric default 0,copper numeric default 0,iron numeric default 0,uranium numeric default 0);
create table economy_runs(id uuid primary key default gen_random_uuid(),run_date date not null,
run_number smallint not null default 1,triggered_by uuid,summary jsonb,ran_at timestamptz default now());
create table economy_bonuses(percent numeric,starts_at timestamptz,ends_at timestamptz,country_id uuid);
create table regions(id uuid,country_id uuid);
create table region_slots(region_id uuid,building text);
create table shop_items(building text,income_kr numeric);
create table transactions(country_id uuid,kind text,label text,amount_kr numeric,details jsonb);
create view country_stats as select c.*,c.id country_id,100::numeric gross_income,
5::numeric coal_prod,2::numeric coal_upkeep,3::numeric oil_prod,4::numeric copper_prod,
6::numeric iron_prod,7::numeric uranium_prod from countries c;
"""

class PayoutTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  if not MIGRATION.exists(): raise RuntimeError(f"Missing {MIGRATION}")
  cls.temp=Path(tempfile.mkdtemp(prefix="payout-pg-")); cls.temp.chmod(0o777)
  cls.socket=cls.temp/"socket"; cls.socket.mkdir(mode=0o777); cls.socket.chmod(0o777)
  cls.prefix=["runuser","-u","nobody","--"] if os.geteuid()==0 else []
  cls.env={k:v for k,v in os.environ.items() if not k.startswith("PG")}
  cls.env.update(PGHOST=str(cls.socket),PGPORT="55439",PGUSER="postgres",PGDATABASE="postgres")
  cls.initdb,cls.pgctl=shutil.which("initdb"),shutil.which("pg_ctl")
  if not cls.initdb or not cls.pgctl: raise RuntimeError("PostgreSQL initdb and pg_ctl are required")
  subprocess.run(cls.prefix+[cls.initdb,"-D",str(cls.temp/"data"),"-U","postgres","-A","trust"],env=cls.env,check=True,stdout=subprocess.DEVNULL)
  subprocess.run(cls.prefix+[cls.pgctl,"-D",str(cls.temp/"data"),"-l",str(cls.temp/"server.log"),"-o",f"-k {cls.socket} -p 55439 -h ''","start"],env=cls.env,check=True,stdout=subprocess.DEVNULL)
  cls.sql(FIXTURE); cls.sql(MIGRATION.read_text())
 @classmethod
 def tearDownClass(cls):
  if hasattr(cls,"pgctl"):
   subprocess.run(cls.prefix+[cls.pgctl,"-D",str(cls.temp/"data"),"stop","-m","immediate"],env=cls.env,check=True,stdout=subprocess.DEVNULL)
   shutil.rmtree(cls.temp)
 @classmethod
 def sql(cls,s,check=True):
  p=subprocess.run(["psql","-X","-qAt","-v","ON_ERROR_STOP=1"],input=s,text=True,capture_output=True,env=cls.env)
  if check and p.returncode: raise AssertionError(p.stderr)
  return p.stdout.strip() if check else p
 def setUp(self):
  self.sql("truncate countries,economy_runs,economy_bonuses,transactions;")
  self.a="00000000-0000-0000-0000-000000000001"; self.b="00000000-0000-0000-0000-000000000002"
  self.sql(f"insert into countries(id) values('{self.a}'),('{self.b}');")
 def cycle(self): return json.loads(self.sql("select run_daily_economy();"))
 def test_every_country_gets_paid_without_profiles_or_heartbeat(self):
  x=self.cycle(); self.assertTrue(x["ok"]); self.assertEqual(x["countries"],2)
  self.assertEqual(self.sql("select string_agg(balance::text,',' order by id) from countries"),"100,100")
  self.assertEqual(self.sql("select count(*) from transactions where kind='ECONOMY'"),"2")
  self.assertEqual(x["inactive_skipped"],0)
 def test_missing_activity_rows_do_not_block_payout(self):
  self.sql("create table player_activity(user_id uuid,last_seen_at timestamptz);")
  self.assertEqual(self.cycle()["countries"],2)
  self.assertEqual(self.sql("select count(*) from player_activity"),"0")
 def test_bonus_and_resource_production_are_preserved(self):
  self.sql(f"insert into economy_bonuses values(25,now()-interval '1 hour',now()+interval '1 hour','{self.a}');")
  self.cycle()
  self.assertEqual(self.sql(f"select balance from countries where id='{self.a}'"),"125")
  self.assertEqual(self.sql(f"select coal||','||oil||','||copper||','||iron||','||uranium from countries where id='{self.a}'"),"23,3,4,6,7")
 def test_automatic_cycle_is_once_per_day(self):
  self.assertTrue(self.cycle()["ok"]); second=self.cycle()
  self.assertFalse(second["ok"]); self.assertEqual(second["reason"],"daily_limit_reached")
  self.assertEqual(self.sql("select count(*) from transactions where kind='ECONOMY'"),"2")

if __name__=="__main__": unittest.main(verbosity=2)
