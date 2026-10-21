import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "kraje-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const next = saved === "light" ? "light" : "dark";
    document.documentElement.classList.toggle("light", next === "light");
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("light", next === "light");
    document.documentElement.classList.toggle("dark", next === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#171717" : "#F5F8FC");
    window.localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  return <button type="button" onClick={toggleTheme} className="theme-toggle" aria-label={theme === "dark" ? "Przełącz na jasny motyw" : "Przełącz na ciemny motyw"} title={theme === "dark" ? "Jasny motyw" : "Ciemny motyw"}>
    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    <span>{theme === "dark" ? "Jasny motyw" : "Ciemny motyw"}</span>
  </button>;
}
