# Headless autoplay

## Приступая к работе

Для работы программы необходимо установить среду [node.js](https://nodejs.org/ru/download/)

### Подготовка к запуску

Перед первым запуском необходимо:

* Скачать репозиторий любым из удобных для вас способов, например из [релизов](https://github.com/yukkerike/headless_autoplay/releases/latest)
* Заполнить [config.yml](config.yml)
* Запустить один из файлов [Запуск.sh](Запуск.sh) или [Запуск.bat](Запуск.bat) в соответствии с вашей ОС

Сниффер запускается командой __npm run sniff__

### Конфигурирование

Осуществляется с помощью редактирования файла [config.yml](config.yml) перед запуском. Начиная с версии 0.0.7 конфиг представлен форматом YAML, миграция настроек в новый формат выполнится автоматически.

Также вы можете воспользоваться новым конфигуратором: [https://yukkerike.github.io/headless_autoplay](https://yukkerike.github.io/headless_autoplay)

Поле __players__ представлено массивом. В него добавляются аккаунты, для которых автоплеер будет запущен.
Внутри массива __"players"__ есть обязательное поле __session__, которое содержит токен игрока в query формате.

~~Токен можно получить через редактор карт. Создайте шамана, платформу и кнопку. В свойствах кнопки поставьте галочку __HaXe (haxeScript)__ и разместите в ней следующий код:~~
~~```~~
~~Type.resolveClass("flash.external.ExternalInterface").call("eval", "var _=prompt('Ваш токен:',document.querySelector('object').childNodes[1].value)")~~
~~```~~

Есть возможность задать настройки по умолчанию сразу для всех аккаунтов. Их нужно заносить в кортеж __"defaults"__. 
У настроек конкретного игрока есть приоритет над глобальными настройками, то есть они перезаписывают умолчания.

В конфиге настройки расположены в порядке приоритета, с которым они будут применены.
Например, у __playInClan__ есть приоритет над __locationId__.


Конфиг с комментариями:
``` yml
host: 88.212.206.137
ports:
  - '11111'
  - '11211'
  - '11311'
logNet: false # Включить логгирование пакетов.
repl: true # Включить интерактивную оболочку для контроля параметров.
defaults:
  reconnect: false # Переподключение к серверу при обрыве соединения.
  reconnectForDailyBonus: false # Переподключиться к серверу в полночь по МСК, чтобы собрать ежедневный бонус.
  checkModerators: true # Выходить из комнаты при наличии в сети модераторов.
  autoPlay: true # Включение автоплеера.
  autoPlayDelay: 4000 # Глобальная задержка перед заходом в дупло, можно определить отдельно для каждого игрока.
  playInClan: true # Играть в клане или на общих локациях.
  paranoidMode: false # Не играть в комнатах, где больше одного человека
  changeRooms: true # Менять комнаты при возможности для экономии 5 секунд (игнорируется, если задан ID комнаты).
  locationId: 4 # ID локации, в которую боту предпочтительно заходить.
    #  сд - 0
    #  топи - 2
    #  испытания - 9
    #  пустыня - 3
    #  аз - 4
    #  шторм - 13
    #  дз - 5
    #  битва - 10
    #  стадион - 15
  surrender: false # Использование навыка Капитуляция для накрутки орехов. Для использования функции вам необходимо задействовать два аккаунта!
  roomId: null # ID комнаты в клане, в которую боту предпочтительно заходить.
  joinId: null # ID белки, за которой бот будет автоматически следовать.
  clanIdToJoin: 0 # ID клана, в который бот должен будет вступить (если аккаунт опоры тоже под управлением бота – заявка аккаунта будет подтверждена автоматически, для этого советую опоре добавить параметр autoPlay: false, чтобы не подставляться этим аккаунтом за зря).
  buyVIP: false # Покупать ВИП.
  donateLevel: null # Уровень, на котором все ресурсы будут вложены и автокач остановлен.
players: # Чтобы переопределить глобальные настройки – продублируйте параметр для конкретного игрока с новым значением.
  - session: >-
      ВАША СЕССИЯ
  # - session: >-
  #     СЕССИЯ ВТОРОГО ИГРОКА
```

## Основано на библиотеках

* [sq-lib](https://github.com/sovlet/sq-lib/) - Библиотека для работы с протоколом игры "Трагедия белок"

## Лицензия

Проект наследует лицензию GPL V2.0 библиотеки [sq-lib](https://github.com/sovlet/sq-lib/) - за подробностями смотрите файл [LICENSE](LICENSE)
