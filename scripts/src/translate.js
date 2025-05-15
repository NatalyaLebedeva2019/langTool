import fs from 'fs';
import path from 'path';
import winston from 'winston';
import axios from 'axios';
import dotenv from 'dotenv';
import { Project, SyntaxKind } from 'ts-morph';

// Загружаем переменные окружения из .env файла
dotenv.config();

// Установка директории и имени лог-файла
const logDir = path.join(process.cwd(), 'log');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Генерация имени лог-файла с временной меткой
const timestamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
const logFileName = path.join(logDir, `${timestamp}.log`);

// Логгер для вывода логов в консоль и файл
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: logFileName })
  ]
});

// Класс для работы с TSX файлами и строками для перевода
export class LocalFinder {
  // Массивы для хранения файлов и строк
  _files = [];
  _strings = [];

  // Переменные для API-ключа и Folder ID
  apiKey;
  folderId;

  // директория с кодом
  dirname;
  // проект tw-morph
  project;

  // Конструктор класса
  constructor(dirname) {
    // Загружаем ключи из .env файла
    this.apiKey = process.env.SECRET_KEY;
    this.folderId = process.env.FOLDER_ID;

    this.dirname = dirname;
    // Создаём проект без tsconfig
    this.project = new Project({
      useInMemoryFileSystem: false, // читаем реальные файлы
    });

    // Добавляем нужные файлы вручную (из папки dirname)
    this.project.addSourceFilesAtPaths(dirname + '/**/*.{ts,tsx}');
  }

  removeOuterQuotes(str) {
    if (
      typeof str === 'string' &&
      str.length >= 2 &&
      ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'")))
    ) {
      return str.slice(1, -1);
    }
    return str;
  }

  hasNoCyrillic(text) {
    return !/[а-яА-ЯёЁ]/.test(text);
  }

  // разбирает, всё что внутри rk на объект со свойствами
  // string - локализуемая строка
  parseRkArgs(args) {
    const text = this.removeOuterQuotes(args[0]);
    const parsedString = {
      string: text, // просто текст, чтобы пихнуть в переводчик
      langFileKey: text, // ключ в файле локализации
    }

    if (args.length === 4 && args[3] === 'true') {
      logger.info(`Использование параметров "${args.join(", ")}" определено как template`);
      parsedString.langFileKey = 'template#' + text;
      return parsedString;
    }

    if (args.length > 1 && this.hasNoCyrillic(args[1])) {
      logger.info(`Использование параметров "${args.join(", ")}" определено как plural`);
      parsedString.langFileKey = 'plural#' + text;
      return parsedString;
    }

    if (args.length === 2) {
      logger.info(`Использование параметров "${args.join(", ")}" определено как использование с контекстом`);
      const context = this.removeOuterQuotes(args[0]);
      const text = this.removeOuterQuotes(args[1]);
      parsedString.langFileKey = text + '@@' + context;
      parsedString.string = text;
      return parsedString;
    }

    logger.info(`Использование параметров "${args.join(", ")}" определено как стандартное использование`);
    return parsedString;
  }

  // Метод для поиска всех строк rk во всех найденных файлах
  findStringsInAllFiles() {
    const allStrings = [];

    // Обрабатываем каждый файл
    for (const sourceFile of this.project.getSourceFiles()) {
      const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

      for (const call of calls) {
        const expression = call.getExpression();

        if (expression.getText() === "rk") {
          const args = call.getArguments().map(arg => arg.getText());
          allStrings.push(this.parseRkArgs(args));
          logger.info(`Найден вызов rk в файле: "${sourceFile.getFilePath()}" с параметрами ${args.join(", ")}`);
        }
      }
    }

    // Сохраняем все найденные строки
    this._strings = allStrings;
  }

  // Метод для получения всех найденных строк
  getStrings() {
    return this._strings;
  }

  // Метод для поиска строк, которые отсутствуют в указанном JSON файле
  findMissingStringsInEndFile(endFile) {
    logger.info(`Читаем JSON из файла: ${endFile}`);
    const fileContent = fs.readFileSync(endFile, 'utf-8');
    let json;

    try {
      // Преобразуем содержимое файла в объект JSON
      json = JSON.parse(fileContent);
    } catch (error) {
      logger.error(`Ошибка парсинга JSON: ${error.message}`);
      return [];
    }

    logger.info(`Получаем все строки из JSON-ключей`);
    const jsonKeys = Object.keys(json);

    // Находим строки, которые отсутствуют в JSON
    const missingStrings = this._strings.filter(str => !jsonKeys.includes(str.langFileKey));

    // Выводим информацию о найденных строках
    if (missingStrings.length <= 0) {
      logger.info(`Все строки найдены среди ключей JSON-файла "${endFile}".`);
    }

    return missingStrings;
  }

  // Метод для перевода отсутствующих строк и записи их в JSON
  async translateMissingStrings(dirName, endFile) {
    // Если API-ключ или Folder ID не заданы, выводим ошибку и завершаем выполнение
    if (!this.apiKey || !this.folderId) {
      logger.error('API ключ или Folder ID не найден! Убедитесь, что переменные SECRET_KEY и FOLDER_ID установлены в .env файле.');
      process.exit(1);
    }

    // Очищаем состояние
    this._files = [];
    this._strings = [];

    // Сначала ищем файлы и строки
    this.findStringsInAllFiles();

    const indent = 3;
    const missing = this.findMissingStringsInEndFile(endFile);

    const fileContent = fs.readFileSync(endFile, 'utf-8');
    let json;

    try {
      json = JSON.parse(fileContent);
    } catch (error) {
      logger.error(`Ошибка парсинга JSON: ${error.message}`);
      json = {};
    }

    try {
      // Получаем переводы для отсутствующих строк
      const translations = await this.translateWithYandex(missing);
      missing.forEach((str, index) => {
        json[str] = translations[index];
        logger.info(`Переведено: "${str}" → "${translations[index]}"`);
      });
    } catch (err) {
      logger.error(`Ошибка при переводе строк: ${err.message}`);
    }

    try {
      // Записываем обновлённый JSON обратно в файл
      fs.writeFileSync(endFile, JSON.stringify(json, null, indent), 'utf-8');
      logger.info(`Файл ${endFile} успешно обновлён.`);
    } catch (err) {
      logger.error(`Ошибка при записи в файл ${endFile}: ${err.message}`);
    }

    return json;
  }

  // Метод для записи отсутствующих строк с пустыми значениями в JSON
  async writeMissingStringsAsEmpty(dirName, endFile) {
    // Очищаем состояние
    this._files = [];
    this._strings = [];

    // Сначала ищем файлы и строки
    this.findStringsInAllFiles();

    const indent = 3;
    const missing = this.findMissingStringsInEndFile(endFile);

    if (!missing?.length) {
      return;
    }

    let json = {};

    try {
      const fileContent = fs.readFileSync(endFile, 'utf-8');
      json = JSON.parse(fileContent);
    } catch (error) {
      logger.error(`Ошибка парсинга JSON: ${error.message}`);
    }

    // Добавляем отсутствующие строки с пустыми значениями
    logger.info(`Дабавление в JSON строк "${endFile}":`);
    missing.forEach(({ langFileKey }) => {
      if (!(langFileKey in json)) {
        logger.info(`- ${langFileKey}`);
        json[langFileKey] = "";
      }
    });

    try {
      // Записываем обновлённый JSON обратно в файл
      fs.writeFileSync(endFile, JSON.stringify(json, null, indent) + '\n', 'utf-8');
      logger.info(`Файл ${endFile} обновлён с пустыми значениями для отсутствующих строк.`);
    } catch (err) {
      logger.error(`Ошибка при записи в файл ${endFile}: ${err.message}`);
    }
  }

  // Метод для перевода строк с помощью API Яндекса
  async translateWithYandex(texts) {
    const url = 'https://translate.api.cloud.yandex.net/translate/v2/translate';

    const config = {
      headers: {
        'Authorization': `Api-Key ${this.apiKey}`,
      },
    };

    try {
      // Отправляем запрос на перевод
      const response = await axios.post(url, {
        sourceLanguageCode: 'ru',
        targetLanguageCode: 'en',
        folderId: this.folderId,
        texts,
      }, config);
      // Возвращаем переведённые строки
      return response.data.translations.map(t => t.text);
    } catch (err) {
      logger.error(`Ошибка при запросе к API Яндекс Переводчика: ${err}`);
      throw err;
    }
  }

  // Новый метод для поиска неиспользуемых строк из JSON в коде
  findUnusedStringsFromEndFile(dirName, endFile) {
    // Очищаем состояние
    this._files = [];
    this._strings = [];

    // Сначала ищем файлы и строки
    this.findStringsInAllFiles();

    logger.info(`Читаем JSON из файла: ${endFile}`);
    const fileContent = fs.readFileSync(endFile, 'utf-8');
    let json;

    try {
      // Преобразуем содержимое JSON в объект
      json = JSON.parse(fileContent);
    } catch (error) {
      logger.error(`Ошибка парсинга JSON: ${error.message}`);
      return [];
    }

    const unusedStrings = [];
    const jsonKeys = Object.keys(json);

    // Проходим по всем ключам JSON
    jsonKeys.forEach(key => {
      let isUsed = false;

      // Проверяем, используется ли этот ключ в коде
      for (const file of this._files) {
        const fileContent = fs.readFileSync(file, 'utf-8');
        if (fileContent.includes(key)) {
          isUsed = true;
          break;
        }
      }

      // Если строка не используется в коде, добавляем её в список
      if (!isUsed) {
        unusedStrings.push(key);
      }
    });

    // Выводим результаты
    if (unusedStrings.length > 0) {
      logger.info(`Неиспользуемые строки из JSON "${endFile}":`);
      unusedStrings.forEach(str => logger.info(`- ${str}`));
    } else {
      logger.info(`Все строки из JSON-файла "${endFile}" используются в файлах.`);
    }

    return unusedStrings;
  }
}
