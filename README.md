# 🚨 ВАЖНОЕ ОБНОВЛЕНИЕ

**Мы добавили поддержку автоматического определения типов использования переводов:**

- 📘 переводы с использованием контекста
- 🔢 plural
- 🧩 `template` — шаблонные строки

> ⚠️ **Внимание:** если строка передаётся в функцию перевода в виде нескольких частей, объединённых через `+`, это может привести к **неправильной интерпретации** и неправильной записи в файл переводов. Используйте шаблонные строки (`` `...${...}` ``) или цельные строки.

---

# LangTool

**LangTool** — это инструмент для автоматизации перевода строк в файлах `.ts` и `.tsx` с использованием Яндекс API Переводчика. Он позволяет находить непереведённые строки и автоматически добавлять их в JSON-файл, а также переводить их.

## 🚀 Возможности

- 🔍 **Поиск непереведённых строк** — проверяет строки в исходных файлах, отсутствующие в указанном JSON-файле, и добавляет их с пустыми значениями.
- 🌐 **Автоматический перевод** — использует Яндекс API для перевода строк с русского на английский и записывает результат в JSON-файл.

## 📦 Установка

1. Клонируйте репозиторий:

   ```bash
   git clone https://github.com/your-repo/langtool.git
   cd langtool
   ```

2. Установите зависимости:

   ```bash
   npm install
   ```

3. Создайте файл `.env` в корне проекта и добавьте ваш API ключ и ID папки (если собираетесь использовать перевод):

   ```
   SECRET_KEY=your-yandex-api-key
   FOLDER_ID=your-folder-id
   ```

## 📁 Структура проекта

- `writeMissing.js` — добавляет отсутствующие строки в JSON с пустыми значениями.
- `translateMissing.js` — переводит отсутствующие строки и добавляет их в JSON.

## ⚙️ Параметры

Оба скрипта принимают следующие параметры:

- `--endFile` (string) — путь к JSON-файлу с переводами.
- `--dirname` (string) — путь к директории с исходным кодом.

## 📌 Примеры использования

### Добавление отсутствующих строк в JSON

```bash
node ./scripts/writeMissing.js --endFile=path/to/file.json --dirname=path/to/source
```

### Перевод и добавление строк в JSON

```bash
node ./scripts/translateMissing.js --endFile=path/to/file.json --dirname=path/to/source
```

## 📝 Логирование

Все действия скриптов логируются в отдельные файлы внутри папки `log`. Имя каждого файла содержит текущую дату и время запуска скрипта.
