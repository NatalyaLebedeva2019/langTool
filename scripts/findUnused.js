import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { LocalFinder } from './src/translate.js'; // путь к файлу с классом

// Загружаем переменные окружения
dotenv.config({ path: '../.env'});

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
    description: 'Путь к JSON-файлу, из которого брать строки',
    type: 'string',
    demandOption: true
  })
  .help()
  .argv;

(async () => {
  const finder = new LocalFinder();
  const unused = await finder.findUnusedStringsFromEndFile(argv.dirname, argv.endFile);

  console.log('\nНеиспользуемые строки из JSON-файла:');
  unused.forEach(str => console.log(`- ${str}`));
})();
