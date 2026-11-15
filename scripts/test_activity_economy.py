"""Execute the actual migration and payout function in a disposable local PostgreSQL.
Never connects to the app database. Run: python3 scripts/test_activity_economy.py
"""
import concurrent.futures
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "drizzle/migrations/0018_heartbeat_only_activity_daily_payouts.sql"
FIXTURE = """
create role authenticated; create role anon; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create function public.is_admin(uuid) returns boolean language sql as $$select false$$;
create table profiles(id uuid primary key,country_id uuid,created_at timestamptz default now());
create table countries(id uuid primary key,balance numeric default 0,coal numeric default 20,
oil numeric default 0,copper numeric default 0,iron numeric default 0,uranium numeric default 0);
create table economy_runs(id uuid default gen_random_uuid(),run_date date unique,
run_number smallint default 1,triggered_by uuid,summary jsonb);
create table economy_bonuses(percent numeric,starts_at timestamptz,ends_at timestamptz,country_id uuid);
create table regions(id uuid,country_id uuid);
create table region_slots(region_id uuid,building text);
create table shop_items(building text,income_kr numeric);
create table transactions(country_id uuid,kind text,label text,amount_kr numeric,details jsonb);
create view country_stats as select c.*,c.id country_id,100::numeric gross_income,
5::numeric coal_prod,2::numeric coal_upkeep,3::numeric oil_prod,4::numeric copper_prod,
6::numeric iron_prod,7::numeric uranium_prod from countries c;
"""

class EconomyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = Path(tempfile.mkdtemp(prefix="activity-postgres-"))
        cls.temp.chmod(0o777)
        cls.socket = cls.temp / "socket"
        cls.socket.mkdir(mode=0o777)
        cls.socket.chmod(0o777)
        cls.prefix = ["runuser", "-u", "nobody", "--"] if os.geteuid() == 0 else []
        cls.env = {k:v for k,v in os.environ.items() if not k.startswith("PG")}
        cls.env.update(PGHOST=str(cls.socket), PGPORT="55439", PGUSER="postgres", PGDATABASE="postgres")
        subprocess.run(cls.prefix+["initdb","-D",str(cls.temp/"data"),"-U","postgres","-A","trust"],env=cls.env,check=True,stdout=subprocess.DEVNULL)
        subprocess.run(cls.prefix+["pg_ctl","-D",str(cls.temp/"data"),"-l",str(cls.temp/"server.log"),"-o",f"-k {cls.socket} -p 55439 -h ''", "start"],env=cls.env,check=True,stdout=subprocess.DEVNULL)
        cls.sql(FIXTURE)
        cls.sql(MIGRATION.read_text())
        cls.sql(MIGRATION.read_text())  # Rerunnable DDL.

    @classmethod
    def tearDownClass(cls):
        subprocess.run(cls.prefix+["pg_ctl","-D",str(cls.temp/"data"),"stop","-m","immediate"],env=cls.env,check=True,stdout=subprocess.DEVNULL)
        shutil.rmtree(cls.temp)

    @classmethod
    def sql(cls, text, check=True):
        result = subprocess.run(["psql","-X","-qAt","-v","ON_ERROR_STOP=1"],input=text,text=True,capture_output=True,env=cls.env)
        if check and result.returncode: raise AssertionError(result.stderr)
        return result.stdout.strip() if check else result

    def setUp(self):
        self.sql("truncate profiles,countries,economy_runs,economy_bonuses,transactions,player_activity;")
        self.country = "00000000-0000-0000-0000-000000000001"
        self.user = "00000000-0000-0000-0000-000000000011"
        self.other = "00000000-0000-0000-0000-000000000012"
        self.sql(f"insert into countries(id) values ('{self.country}'); insert into profiles(id,country_id) values ('{self.user}','{self.country}'),('{self.other}','{self.country}');")

    def heartbeat(self):
        return self.sql(f"set role authenticated; set request.jwt.claim.sub='{self.user}'; select record_player_activity();")

    def cycle(self):
        return json.loads(self.sql("select run_daily_economy();"))

    def age(self, age):
        self.sql(f"alter table player_activity disable trigger stamp_player_activity_timestamp; update player_activity set last_seen_at=now()-interval '{age}'; alter table player_activity enable trigger stamp_player_activity_timestamp;")

    def test_new_account_and_missing_heartbeat_are_inactive(self):
        self.assertEqual(self.sql("select count(*) from player_activity"),"0")
        self.assertEqual(self.cycle()["countries"],0)
        self.assertEqual(self.sql("select balance from countries"),"0")

    def test_more_than_five_days_is_inactive(self):
        self.heartbeat(); self.age("5 days 1 second")
        self.assertEqual(self.cycle()["countries"],0)

    def test_recent_player_in_multi_player_country_pays_once(self):
        self.heartbeat()
        result=self.cycle(); self.assertEqual(result["countries"],1)
        self.assertEqual(self.sql("select balance||','||coal||','||oil||','||copper||','||iron||','||uranium from countries"),"100,23,3,4,6,7")
        self.assertEqual(self.sql("select count(*) from transactions"),"1")

    def test_two_active_players_do_not_multiply_payout(self):
        self.heartbeat()
        self.sql(f"set role authenticated;set request.jwt.claim.sub='{self.other}';select record_player_activity();")
        self.assertEqual(self.cycle()["countries"],1)
        self.assertEqual(self.sql("select balance from countries"),"100")

    def test_repeat_cycle_is_noop(self):
        self.heartbeat(); self.cycle()
        self.assertFalse(self.cycle()["ok"])
        self.assertEqual(self.sql("select balance from countries"),"100")
        self.assertEqual(self.sql("select count(*) from economy_runs"),"1")

    def test_concurrent_cycles_pay_only_once(self):
        self.heartbeat()
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda _: self.cycle(),range(2)))
        self.assertEqual(sum(r["ok"] for r in results),1)
        self.assertEqual(self.sql("select balance from countries"),"100")

    def test_rls_blocks_other_user_and_future_clock(self):
        self.heartbeat()
        attempt=self.sql(f"set role authenticated;set request.jwt.claim.sub='{self.user}';insert into player_activity values ('{self.other}',now());",False)
        self.assertNotEqual(attempt.returncode,0)
        self.sql(f"set role authenticated;set request.jwt.claim.sub='{self.user}';update player_activity set last_seen_at='2099-01-01';")
        self.assertEqual(self.sql("select last_seen_at <= now() and last_seen_at > now()-interval '10 seconds' from player_activity"),"t")

    def test_anonymous_cannot_heartbeat(self):
        self.assertNotEqual(self.sql("set role anon; select record_player_activity();",False).returncode,0)

    def test_bonus_and_production_are_preserved(self):
        self.heartbeat()
        self.sql(f"insert into economy_bonuses values (25,now()-interval '1 hour',now()+interval '1 hour','{self.country}');")
        self.cycle(); self.assertEqual(self.sql("select balance from countries"),"125")

if __name__ == "__main__": unittest.main(verbosity=2)