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
    description: 'Путь к JSON-файлу, в который нужно записать пустые строки',
    type: 'string',
    demandOption: true
  })
  .help()
  .argv;

(async () => {
  const finder = new LocalFinder();
  await finder.writeMissingStringsAsEmpty(argv.dirname, argv.endFile);

  console.log(`\nПустые значения для отсутствующих строк были записаны в файл ${argv.endFile}`);
})();
