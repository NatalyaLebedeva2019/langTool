import fs from 'fs';
import path from 'path';
import winston from 'winston';
import axios from 'axios';
import dotenv from 'dotenv';

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

  // Конструктор класса
  constructor() {
    // Загружаем ключи из .env файла
    this.apiKey = process.env.SECRET_KEY;
    this.folderId = process.env.FOLDER_ID;
  }

  // Метод для поиска всех .ts и .tsx файлов в указанной директории
  findTSFiles(dirname) {
    logger.info(`Начинаю поиск файлов в директории: ${dirname}`);
    const result = [];

    // Вспомогательная функция для рекурсивного поиска файлов в подкаталогах
    const searchDirectory = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Если это директория, вызываем рекурсивно для неё
        if (entry.isDirectory()) {
          searchDirectory(fullPath);
        } 
        // Если это файл с расширением .ts или .tsx, добавляем его в результат
        else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))
        ) {
          logger.info(`Найден файл: ${fullPath}`);
          result.push(fullPath);
        }
      }
    };

    try {
      // Запуск поиска
      searchDirectory(dirname);
      this._files = result;
      logger.info(`Поиск завершён. Найдено файлов: ${result.length}`);
    } catch (err) {
      logger.error(`Ошибка при сканировании: ${err.message}`);
    }
  }

  // Метод для получения списка найденных файлов
  getFiles() {
    return this._files;
  }

  // Метод для извлечения строк, переданных в функцию rk
  findStringsInRK(fileName) {
    const code = fs.readFileSync(fileName, 'utf-8');
    const matches = [...code.matchAll(/rk\s*\(\s*(['"])((?:\\\1|.)*?)\1\s*(?:,.*)?\)/g)];
    const strings = matches.map(match => match[2]);
    return strings;
  }

  // Метод для поиска всех строк rk во всех найденных файлах
  findStringsInAllFiles() {
    const allStrings = [];

    // Проходим по всем файлам и находим строки в каждом
    for (const file of this._files) {
      try {
        const strings = this.findStringsInRK(file);
        allStrings.push(...strings);
      } catch (err) {
        logger.error(`Ошибка при обработке файла ${file}: ${err.message}`);
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
    const missingStrings = this._strings.filter(str => !jsonKeys.includes(str));

    // Выводим информацию о найденных строках
    if (missingStrings.length > 0) {
      logger.info(`Не найдено среди ключей JSON "${endFile}":`);
      missingStrings.forEach(str => logger.info(`- ${str}`));
    } else {
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
    this.findTSFiles(dirName);
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
    this.findTSFiles(dirName);
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
    missing.forEach(str => {
      if (!(str in json)) {
        json[str] = "";
      }
    });

    try {
      // Записываем обновлённый JSON обратно в файл
      fs.writeFileSync(endFile, JSON.stringify(json, null, indent), 'utf-8');
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
    this.findTSFiles(dirName);
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
