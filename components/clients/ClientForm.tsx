"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type ClientFormData = {
  firstName: string;
  lastName: string;
  phone: string;
};

type ClientFormProps = {
  initialData?: Partial<ClientFormData>;
  onSubmit: (data: ClientFormData) => void;
  isLoading?: boolean;
  submitLabel?: string;
};

// Форматирование телефона с пробелами и дефисами
function formatPhoneDisplay(value: string): string {
  const clean = value.replace(/\D/g, '');
  
  if (!clean) return '';
  
  // Беларусь: +375 29 123-45-67
  if (clean.startsWith('375')) {
    const rest = clean.slice(3);
    let result = '+375';
    if (rest.length > 0) {
      // Код оператора (2 цифры)
      const code = rest.slice(0, 2);
      result += ' ' + code;
    }
    if (rest.length > 2) {
      // Первая часть номера (3 цифры)
      const part1 = rest.slice(2, 5);
      result += ' ' + part1;
    }
    if (rest.length > 5) {
      // Вторая часть (2 цифры)
      const part2 = rest.slice(5, 7);
      result += '-' + part2;
    }
    if (rest.length > 7) {
      // Третья часть (2 цифры)
      const part3 = rest.slice(7, 9);
      result += '-' + part3;
    }
    return result;
  }
  
  // Россия: +7 999 123-45-67
  if (clean.startsWith('7')) {
    const rest = clean.slice(1);
    let result = '+7';
    if (rest.length > 0) {
      // Код оператора (3 цифры)
      const code = rest.slice(0, 3);
      result += ' ' + code;
    }
    if (rest.length > 3) {
      // Первая часть номера (3 цифры)
      const part1 = rest.slice(3, 6);
      result += ' ' + part1;
    }
    if (rest.length > 6) {
      // Вторая часть (2 цифры)
      const part2 = rest.slice(6, 8);
      result += '-' + part2;
    }
    if (rest.length > 8) {
      // Третья часть (2 цифры)
      const part3 = rest.slice(8, 10);
      result += '-' + part3;
    }
    return result;
  }
  
  // Если начинается с 8 (российский номер без +)
  if (clean.startsWith('8')) {
    const rest = clean.slice(1);
    let result = '+7';
    if (rest.length > 0) {
      const code = rest.slice(0, 3);
      result += ' ' + code;
    }
    if (rest.length > 3) {
      const part1 = rest.slice(3, 6);
      result += ' ' + part1;
    }
    if (rest.length > 6) {
      const part2 = rest.slice(6, 8);
      result += '-' + part2;
    }
    if (rest.length > 8) {
      const part3 = rest.slice(8, 10);
      result += '-' + part3;
    }
    return result;
  }
  
  // Если номер начинается с 9 (белорусский без +375)
  if (clean.length > 0 && clean[0] === '9') {
    let result = '+375';
    const rest = clean;
    if (rest.length > 0) {
      const code = rest.slice(0, 2);
      result += ' ' + code;
    }
    if (rest.length > 2) {
      const part1 = rest.slice(2, 5);
      result += ' ' + part1;
    }
    if (rest.length > 5) {
      const part2 = rest.slice(5, 7);
      result += '-' + part2;
    }
    if (rest.length > 7) {
      const part3 = rest.slice(7, 9);
      result += '-' + part3;
    }
    return result;
  }
  
  // Если что-то пошло не так, возвращаем как есть
  return '+' + clean;
}

// Валидация телефона (Беларусь + Россия)
function validatePhone(phone: string): { valid: boolean; message: string } {
  const clean = phone.replace(/\D/g, '');
  
  if (!clean) {
    return { valid: false, message: "Введите номер телефона" };
  }
  
  // Беларусь: +375 + 9 цифр = 12 цифр
  if (clean.startsWith('375') && clean.length === 12) {
    return { valid: true, message: "" };
  }
  
  // Россия: +7 + 10 цифр = 11 цифр
  if (clean.startsWith('7') && clean.length === 11) {
    return { valid: true, message: "" };
  }
  
  // Россия: 8 + 10 цифр = 11 цифр (без +)
  if (clean.startsWith('8') && clean.length === 11) {
    return { valid: true, message: "" };
  }
  
  return { 
    valid: false, 
    message: "Введите корректный номер (например, +375 29 123-45-67 или +7 999 123-45-67)" 
  };
}

export function ClientForm({ 
  initialData = {}, 
  onSubmit, 
  isLoading = false,
  submitLabel = "Добавить клиента"
}: ClientFormProps) {
  const [data, setData] = useState<ClientFormData>({
    firstName: initialData.firstName || "",
    lastName: initialData.lastName || "",
    phone: initialData.phone || "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ClientFormData, string>>>({});

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Убираем все нецифровые символы, но сохраняем + на случай, если пользователь вводит вручную
    const digits = raw.replace(/[^\d+]/g, '');
    
    // Если пользователь вводит +, оставляем только цифры
    const cleanDigits = digits.replace(/\D/g, '');
    
    // Форматируем для отображения
    const formatted = formatPhoneDisplay(cleanDigits);
    setData({ ...data, phone: formatted });
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ClientFormData, string>> = {};
    
    if (!data.firstName.trim()) {
      newErrors.firstName = "Имя обязательно";
    } else if (data.firstName.length > 50) {
      newErrors.firstName = "Имя не может быть длиннее 50 символов";
    }
    
    if (data.lastName && data.lastName.length > 50) {
      newErrors.lastName = "Фамилия не может быть длиннее 50 символов";
    }
    
    const phoneValidation = validatePhone(data.phone);
    if (!phoneValidation.valid) {
      newErrors.phone = phoneValidation.message;
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="firstName" className="block text-sm font-medium text-neutral-700">
          Имя <span className="text-red-500">*</span>
        </label>
        <Input
          id="firstName"
          value={data.firstName}
          onChange={(e) => setData({ ...data, firstName: e.target.value })}
          placeholder="Введите имя"
          maxLength={50}
          className={errors.firstName ? "border-red-500" : ""}
        />
        {errors.firstName && (
          <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>
        )}
        <p className="mt-0.5 text-[10px] text-neutral-400">
          Максимум 50 символов
        </p>
      </div>

      <div>
        <label htmlFor="lastName" className="block text-sm font-medium text-neutral-700">
          Фамилия
        </label>
        <Input
          id="lastName"
          value={data.lastName}
          onChange={(e) => setData({ ...data, lastName: e.target.value })}
          placeholder="Введите фамилию"
          maxLength={50}
          className={errors.lastName ? "border-red-500" : ""}
        />
        {errors.lastName && (
          <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>
        )}
        <p className="mt-0.5 text-[10px] text-neutral-400">
          Максимум 50 символов
        </p>
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-neutral-700">
          Телефон <span className="text-red-500">*</span>
        </label>
        <Input
          id="phone"
          value={data.phone}
          onChange={handlePhoneChange}
          placeholder="+375 29 123-45-67 или +7 999 123-45-67"
          maxLength={20}
          className={errors.phone ? "border-red-500" : ""}
        />
        {errors.phone && (
          <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
        )}
        <p className="mt-0.5 text-[10px] text-neutral-400">
          Формат: +375 29 123-45-67 или +7 999 123-45-67
        </p>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isLoading ? "Сохранение..." : submitLabel}
      </button>
    </form>
  );
}