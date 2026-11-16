# TDOC Export

Экспорт выбранных Markdown-документов TDOC / Quartz v5 в DOCX и PDF в браузере.

## Возможности

- выбор заметок и папок из build manifest;
- выбор всех документов или ссылок, видимых в дереве `.explorer`;
- генерация DOCX и PDF;
- перенос обычного Markdown, заголовков, списков, таблиц и изображений (если браузер может загрузить изображение);
- поддержка `configuration.baseUrl`, в том числе GitHub Pages в подкаталоге;
- настраиваемые CSS и XML-файл темы.

Экспорт выполняется на стороне браузера посетителя. Содержимое заметок не отправляется на внешний сервис.

## Подключение в TDOC

Добавьте запись в существующий массив `plugins` файла `quartz.config.yaml`:

```yaml
  - source: github:semsig13-tech/quartz-export#integration-test
    enabled: true
    order: 95
    options:
      manifestPath: static/tdoc-export-index.json
      iconPath: static/tdoc-export.svg
      toolbarSelector: ".search, .darkmode, .readermode"
      explorerSelector: ".explorer"
      buttonLabel: "Экспорт"
      customCss: static/export.css
      themeXml: themes/export-theme.xml
      includeDrafts: false
```

TDOC устанавливает Git-плагины собственным загрузчиком. Локальная сборка:

```bash
npm ci
npx quartz plugin install
npx quartz build --serve
```

## Файлы

- `src/index.ts` — Quartz emitter, manifest и подключение browser client;
- `src/client.ts` — окно выбора и генераторы DOCX/PDF;
- `src/types.ts` — типы параметров и manifest;
- `static/icon.svg` — иконка;
- `static/export.css` — стили интерфейса;
- `themes/export-theme.xml` — базовая тема экспорта.

## Ограничения

Это интеграционная версия для проверки в отдельной ветке TDOC, а не production-релиз. Сложные Obsidian/Quartz-конструкции Markdown могут потребовать дополнительной обработки. Загрузка внешних изображений в PDF/DOCX зависит от CORS-настроек источника. XML-файл задаёт ограниченный набор параметров темы, а не произвольные правила оформления.
