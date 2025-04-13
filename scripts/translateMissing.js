import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { LocalFinder } from './src/translate.js'; // путь к файлу с классом

// Загружаем переменные окружения
dotenv.config();

// Разбор аргументов командной строки
const argv = yargs(hideBin(process.argv))
  .option('dirname', {
    alias: 'd',
    description: 'Путь к директории с .ts/.tsx файлами',
    type: 'string',
    demandOption: true
  })
  .option('endFile', {
    alias: 'e',
    description: 'Путь к JSON-файлу для перевода строк',
    type: 'string',
    demandOption: true
  })
  .help()
  .argv;

(async () => {
  const finder = new LocalFinder();
  const translated = await finder.translateMissingStrings(argv.dirname, argv.endFile);

  console.log(`\nПереведённые строки для файла ${argv.endFile}:`);
  console.log(translated);
})();
