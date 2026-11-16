# Quartz Export for TDOC (DOCX + PDF)

Клиентский экспорт выбранных Markdown-страниц Quartz v5 в DOCX и PDF. Плагин публикует индекс на этапе сборки, а конвертацию выполняет в браузере — сервер не требуется, подходит для GitHub Pages.

> **Статус:** стартовая реализация / integration preview. Репозиторий `semsig13-tech/TDOC` и исходники `custom-explorer` не удалось клонировать в текущей среде (сетевой доступ к GitHub отсутствовал). Поэтому DOM-селекторы Explorer и фактический контракт Quartz v5 необходимо сверить в TDOC перед production-включением. Не считать эту сборку проверенной на TDOC.

## Возможности

- Кнопка экспорта с заменяемой SVG-иконкой.
- Диалог в палитре Quartz через CSS-переменные `--light`, `--dark`, `--lightgray`, `--secondary`, `--highlight`.
- Выбор папок и отдельных документов.
- DOCX и PDF в браузере.
- Поддержка Markdown через `marked`, таблиц, заголовков, списков и ссылок.
- Настройки пользовательского CSS и XML-темы.
- Общий build-time индекс страниц `static/tdoc-export-index.json`.
- Кнопка «Выбрать видимые в проводнике» через DOM-адаптер: ссылки custom-explorer сопоставляются со slug из индекса.

## Важные ограничения текущего прототипа

1. `ExplorerAdapter` намеренно использует DOM-сопоставление ссылок, а не выдуманный внутренний API `custom-explorer`. После получения исходников TDOC надо уточнить `explorerSelector` и, если доступен публичный API/события, заменить DOM-адаптер на него.
2. Встраивание изображений в DOCX в этом preview ещё не реализовано: экспорт оставляет читаемую подпись/ссылку вместо бинарного вложения. Это нужно завершить перед production-релизом.
3. PDF использует html2pdf.js/html2canvas: внешние изображения должны разрешать CORS. Локальные изображения сайта обычно подходят.
4. XML-файл темы пока является спецификацией/примером. Парсер XML и применение всех токенов к DOCX/PDF необходимо завершить перед production-релизом.
5. `toc` в UI пока является зарезервированной опцией: полноценное поле оглавления Word и кликабельное оглавление PDF нужно добавить отдельным этапом.
6. Требуется проверить точную сигнатуру `externalResources`, emitter-типы и размещение toolbar на конкретном Quartz v5 commit TDOC. Прототип следует собрать на копии TDOC до merge.

## Установка в TDOC

В корне Quartz-проекта:

```bash
npx quartz plugin add github:semsig13-tech/quartz-export
```

Затем в `quartz.config.yaml` включить emitter (точный блок конфигурации следует сверить с установленным форматом community plugin в вашей ревизии Quartz v5):

```yaml
plugins:
  emitters:
    - source: github:semsig13-tech/quartz-export
      enabled: true
      options:
        manifestPath: static/tdoc-export-index.json
        iconPath: static/icon.svg
        toolbarSelector: ".search, .darkmode, .readermode"
        explorerSelector: ".custom-explorer"
        buttonLabel: "Экспорт"
        customCss: "static/export.css"
        themeXml: "static/export-theme.xml"
```

> В upstream Quartz v5 community plugins регистрируются в едином массиве `plugins`, а тип плагина определяется его manifest. Перед установкой нужно сверить имя manifest и схему опций с точным commit форка TDOC; этот архив пока содержит реализацию emitter, но не подтверждённую публикационную обвязку community plugin.

Сборка и локальная проверка:

```bash
npm install
npx quartz plugin install --from-config
npx quartz build --serve
```

## Локальная разработка

```bash
git clone https://github.com/semsig13-tech/quartz-export.git
cd quartz-export
npm install
npm run build
npm test
```

## Настройка иконки

Замените `static/icon.svg` своим SVG и укажите `iconPath` в конфигурации. SVG должен быть локальным и доступным по указанному пути.

## План доведения до production

- [ ] Подтвердить интерфейсы emitter и `externalResources` по точному commit TDOC.
- [ ] Получить исходник custom-explorer и подключить его реальный tree model/API.
- [ ] Встроить изображения в DOCX через `ImageRun` (с MIME/размером и обработкой CORS).
- [ ] Реализовать XML theme parser и применить настройки к обоим форматам.
- [ ] Реализовать оглавление и номера страниц.
- [ ] Добавить тесты на wikilinks, относительные изображения, вложенные папки, frontmatter и исключения.
- [ ] Проверить Windows/Linux CI и GitHub Pages baseUrl/subpath.

## Безопасность

- XML используется только как данные темы; не выполнять скрипты из XML.
- CSS пользователя загружается как stylesheet; доверять только CSS, контролируемому владельцем сайта.
- Экспорт выполняется локально в браузере. Содержимое страниц не отправляется на внешний сервис.
