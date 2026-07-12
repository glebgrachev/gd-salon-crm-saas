"use client";

import { useState, useMemo } from "react";

export type Country = {
  code: string;      // ISO, для key
  name: string;
  flag: string;
  dial: string;      // без плюса
  len: number;       // сколько цифр в национальной части
  mask: string;      // шаблон для подсказки
};

export const COUNTRIES: Country[] = [
  { code: "RU", name: "Россия",      flag: "🇷🇺", dial: "7",   len: 10, mask: "999 123-45-67" },
  { code: "KZ", name: "Казахстан",   flag: "🇰🇿", dial: "7",   len: 10, mask: "701 123-45-67" },
  { code: "BY", name: "Беларусь",    flag: "🇧🇾", dial: "375", len: 9,  mask: "29 123-45-67" },
  { code: "UA", name: "Украина",     flag: "🇺🇦", dial: "380", len: 9,  mask: "67 123-45-67" },
  { code: "UZ", name: "Узбекистан",  flag: "🇺🇿", dial: "998", len: 9,  mask: "90 123-45-67" },
  { code: "KG", name: "Киргизия",    flag: "🇰🇬", dial: "996", len: 9,  mask: "70 123-45-67" },
  { code: "AZ", name: "Азербайджан", flag: "🇦🇿", dial: "994", len: 9,  mask: "50 123-45-67" },
  { code: "GE", name: "Грузия",      flag: "🇬🇪", dial: "995", len: 9,  mask: "55 123-45-67" },
  { code: "AM", name: "Армения",     flag: "🇦🇲", dial: "374", len: 8,  mask: "77 12-34-56" },
  { code: "MD", name: "Молдова",     flag: "🇲🇩", dial: "373", len: 8,  mask: "60 12-34-56" },
];

// Разбирает E.164 (+79991234567) на страну и национальную часть
export function parsePhone(e164: string | null): { country: Country; national: string } {
  const fallback = COUNTRIES[0];
  if (!e164) return { country: fallback, national: "" };

  const digits = e164.replace(/\D/g, "");
  if (!digits) return { country: fallback, national: "" };

  // ищем самое длинное совпадение по коду страны
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  for (const c of sorted) {
    if (digits.startsWith(c.dial) && digits.length === c.dial.length + c.len) {
      return { country: c, national: digits.slice(c.dial.length) };
    }
  }

  // не распознали — считаем РФ, берём последние 10
  return { country: fallback, national: digits.slice(-fallback.len) };
}

export default function PhoneInput({
  value,
  onChange,
  disabled,
}: {
  value: string | null;                          // E.164 или null
  onChange: (e164: string | null, valid: boolean) => void;
  disabled?: boolean;
}) {
  const parsed = useMemo(() => parsePhone(value), [value]);
  const [country, setCountry] = useState<Country>(parsed.country);
  const [national, setNational] = useState(parsed.national);

  const valid = national.length === country.len;
  const touched = national.length > 0;

  function emit(c: Country, n: string) {
    const ok = n.length === c.len;
    onChange(n ? `+${c.dial}${n}` : null, ok || n.length === 0);
  }

  function onCountry(code: string) {
    const c = COUNTRIES.find((x) => x.code === code) ?? COUNTRIES[0];
    // обрезаем, если новый формат короче
    const n = national.slice(0, c.len);
    setCountry(c);
    setNational(n);
    emit(c, n);
  }

  function onNational(raw: string) {
    const n = raw.replace(/\D/g, "").slice(0, country.len);
    setNational(n);
    emit(country, n);
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={country.code}
          onChange={(e) => onCountry(e.target.value)}
          disabled={disabled}
          className="rounded-lg border border-neutral-300 px-2 py-2 text-sm outline-none focus:border-neutral-900 disabled:opacity-50"
        >
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.flag} +{c.dial}
            </option>
          ))}
        </select>

        <input
          value={national}
          onChange={(e) => onNational(e.target.value)}
          disabled={disabled}
          inputMode="numeric"
          placeholder={country.mask}
          className={`w-48 rounded-lg border px-3 py-2 text-sm outline-none disabled:opacity-50 ${
            touched && !valid
              ? "border-red-300 focus:border-red-500"
              : "border-neutral-300 focus:border-neutral-900"
          }`}
        />
      </div>

      <div className="mt-1 text-xs">
        {touched && !valid ? (
          <span className="text-red-600">
            Нужно {country.len} цифр, введено {national.length}
          </span>
        ) : valid ? (
          <span className="text-emerald-600">
            +{country.dial} {national} · {country.name}
          </span>
        ) : (
          <span className="text-neutral-400">
            {country.name} · {country.len} цифр после кода
          </span>
        )}
      </div>
    </div>
  );
}
