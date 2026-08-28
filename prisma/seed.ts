/**
 * Демо-данные платформы «Фукуок».
 *
 * Объёмы согласованы: 7 районов, 18 отелей, 12 байков, словарь удобств,
 * разные цены и юниты, пользователи всех ролей, заявки в разных статусах.
 * Данные демонстрационные — реальные заменяются через админку.
 *
 * Соглашения, которые сид соблюдает намеренно:
 *  • Контент только на RU. Схема поддерживает EN и VI — добавление языка
 *    является вставкой строк в *Translation, а не миграцией.
 *  • Деньги — целые числа в МИНОРНЫХ единицах (BigInt): для VND это донги,
 *    для USD — центы. Никаких дробных значений.
 *  • priceFromAmount считается как минимум по активным юнитам — ровно то же
 *    правило, которое затем реализует service layer.
 *  • id не задаются вручную: uuid(7) генерирует Prisma Client.
 *
 * Запуск:  npm run db:seed          (нужен поднятый PostgreSQL и DATABASE_URL)
 *          npm run db:verify:seed   (поднимет свой сервер и проверит результат)
 */

import { PrismaClient, Prisma, ListingStatus, Transmission } from '@prisma/client';
import { hashSync } from '@node-rs/argon2';

const prisma = new PrismaClient();

/** Пароль всех демо-аккаунтов. */
const DEMO_PASSWORD = 'demo1234';

/** Нейтральный плейсхолдер размытия. Реальные значения считает sharp при загрузке. */
const BLUR =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBASfMhbcAAAAASUVORK5CYII=';

// ═══════════════════════════════════════════════════════════════════════════
//  СПРАВОЧНИКИ
// ═══════════════════════════════════════════════════════════════════════════

const AREAS = [
  { slug: 'duong-dong', name: 'Дуонг Донг', lat: 10.217, lng: 103.96,
    description: 'Главный город острова: ночной рынок, кафе, аптеки, банки. Отсюда удобно выезжать в любую точку Фукуока.' },
  { slug: 'ong-lang', name: 'Онг Ланг', lat: 10.26, lng: 103.92,
    description: 'Тихие бухты с камнями и пальмами, бутик-отели и бунгало. Популярен у тех, кто едет за спокойным отдыхом.' },
  { slug: 'bai-truong', name: 'Бай Труонг (Лонг Бич)', lat: 10.17, lng: 103.97,
    description: 'Самый длинный пляж острова, около 15 км. Закаты, пляжные бары и основная концентрация курортов.' },
  { slug: 'bai-sao', name: 'Бай Сао', lat: 10.04, lng: 104.03,
    description: 'Белый песок и бирюзовая вода на юго-востоке. Открытка Фукуока и самый фотографируемый пляж.' },
  { slug: 'an-thoi', name: 'Ан Тхой', lat: 10.01, lng: 104.01,
    description: 'Порт на юге: отсюда уходят катера на архипелаг и начинается канатная дорога на Хон Тхом.' },
  { slug: 'cua-can', name: 'Куа Кан', lat: 10.3, lng: 103.91,
    description: 'Север острова: устье реки, мангры, редкая застройка. Место для тех, кому нужна тишина и природа.' },
  { slug: 'ganh-dau', name: 'Ган Дау', lat: 10.38, lng: 103.85,
    description: 'Северо-западный мыс с видом на Камбоджу. Крупные курортные комплексы и парки развлечений рядом.' },
];

type AmenityScopeLit = 'HOTEL' | 'BIKE' | 'ANY';

const AMENITIES: { code: string; name: string; group: string; scope: AmenityScopeLit }[] = [
  // отели
  { code: 'wifi',             name: 'Wi-Fi',                     group: 'internet',  scope: 'ANY' },
  { code: 'air-conditioning', name: 'Кондиционер',               group: 'comfort',   scope: 'HOTEL' },
  { code: 'tv',               name: 'Телевизор',                 group: 'comfort',   scope: 'HOTEL' },
  { code: 'minibar',          name: 'Мини-бар',                  group: 'comfort',   scope: 'HOTEL' },
  { code: 'safe',             name: 'Сейф',                      group: 'comfort',   scope: 'HOTEL' },
  { code: 'balcony',          name: 'Балкон или терраса',        group: 'comfort',   scope: 'HOTEL' },
  { code: 'kitchenette',      name: 'Мини-кухня',                group: 'comfort',   scope: 'HOTEL' },
  { code: 'non-smoking',      name: 'Номера для некурящих',      group: 'comfort',   scope: 'HOTEL' },
  { code: 'breakfast',        name: 'Завтрак включён',           group: 'food',      scope: 'HOTEL' },
  { code: 'restaurant',       name: 'Ресторан',                  group: 'food',      scope: 'HOTEL' },
  { code: 'bar',              name: 'Бар',                       group: 'food',      scope: 'HOTEL' },
  { code: 'pool',             name: 'Бассейн',                   group: 'water',     scope: 'HOTEL' },
  { code: 'kids-pool',        name: 'Детский бассейн',           group: 'water',     scope: 'HOTEL' },
  { code: 'private-beach',    name: 'Собственный пляж',          group: 'water',     scope: 'HOTEL' },
  { code: 'beach-access',     name: 'Выход к пляжу',             group: 'water',     scope: 'HOTEL' },
  { code: 'reception-24h',    name: 'Круглосуточная стойка',     group: 'service',   scope: 'HOTEL' },
  { code: 'airport-transfer', name: 'Трансфер из аэропорта',     group: 'service',   scope: 'HOTEL' },
  { code: 'laundry',          name: 'Прачечная',                 group: 'service',   scope: 'HOTEL' },
  { code: 'tour-desk',        name: 'Экскурсионное бюро',        group: 'service',   scope: 'ANY' },
  { code: 'spa',              name: 'Спа',                       group: 'service',   scope: 'HOTEL' },
  { code: 'gym',              name: 'Тренажёрный зал',           group: 'service',   scope: 'HOTEL' },
  { code: 'family-rooms',     name: 'Семейные номера',           group: 'family',    scope: 'HOTEL' },
  { code: 'parking',          name: 'Парковка',                  group: 'other',     scope: 'ANY' },
  { code: 'pet-friendly',     name: 'Можно с животными',         group: 'other',     scope: 'HOTEL' },
  // байки
  { code: 'helmet-included',  name: 'Шлемы в комплекте',         group: 'equipment', scope: 'BIKE' },
  { code: 'raincoat',         name: 'Дождевик',                  group: 'equipment', scope: 'BIKE' },
  { code: 'phone-holder',     name: 'Держатель для телефона',    group: 'equipment', scope: 'BIKE' },
  { code: 'usb-charger',      name: 'USB-зарядка',               group: 'equipment', scope: 'BIKE' },
  { code: 'top-case',         name: 'Багажный кофр',             group: 'equipment', scope: 'BIKE' },
  { code: 'delivery',         name: 'Доставка по острову',       group: 'service',   scope: 'BIKE' },
  { code: 'insurance-basic',  name: 'Базовая страховка',         group: 'service',   scope: 'BIKE' },
  { code: 'free-cancel',      name: 'Бесплатная отмена',         group: 'service',   scope: 'ANY' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  ОТЕЛИ — 18
// ═══════════════════════════════════════════════════════════════════════════

type Unit = {
  code: string;
  name: string;
  description?: string;
  capacity?: number;
  quantity: number;
  price: number;
  minDuration?: number;
};

type Hotel = {
  slug: string; title: string; short: string; description: string;
  area: string; address: string;
  status?: ListingStatus; featured?: boolean;
  stars?: number; beachM?: number; centerM?: number; rooms?: number;
  amenities: string[]; units: Unit[]; images: number;
};

const HOTELS: Hotel[] = [
  {
    slug: 'coco-garden-bungalows', title: 'Коко Гарден Бунгало',
    short: 'Бунгало в кокосовой роще в двух минутах от тихого пляжа Онг Ланг',
    description: 'Небольшой комплекс из деревянных бунгало, расставленных в кокосовой роще. К пляжу ведёт своя дорожка, идти около двух минут. Завтрак подают на открытой террасе у воды, вечером включают гирлянды и работает бар. Хороший вариант для тех, кто хочет тишины, но не готов уезжать далеко от города.',
    area: 'ong-lang', address: 'Ong Lang Beach, Cua Duong', featured: true,
    stars: 3, beachM: 120, centerM: 7000, rooms: 24,
    amenities: ['wifi', 'air-conditioning', 'breakfast', 'pool', 'beach-access', 'parking', 'restaurant', 'tour-desk', 'laundry', 'free-cancel'],
    units: [
      { code: 'standard', name: 'Стандартный номер', description: 'Номер в основном корпусе, окно в сад.', capacity: 2, quantity: 12, price: 850_000 },
      { code: 'bungalow', name: 'Бунгало в саду', description: 'Отдельное деревянное бунгало с террасой и гамаком.', capacity: 2, quantity: 8, price: 1_350_000 },
      { code: 'family-bungalow', name: 'Семейное бунгало', description: 'Две комнаты, подходит для семьи с детьми.', capacity: 4, quantity: 4, price: 1_900_000 },
    ],
    images: 5,
  },
  {
    slug: 'sunset-sands-resort', title: 'Сансет Сэндс Резорт',
    short: 'Курорт первой линии на Лонг Бич с двумя бассейнами и спа',
    description: 'Курортный комплекс прямо на Лонг Бич — тот самый пляж, ради закатов на котором на Фукуок и едут. Два бассейна, включая детский, спа и ресторан с видом на море. Шезлонги на пляже для гостей бесплатны. До ночного рынка Дуонг Донга примерно двадцать минут на байке.',
    area: 'bai-truong', address: 'Long Beach, Duong To', featured: true,
    stars: 4, beachM: 0, centerM: 9000, rooms: 96,
    amenities: ['wifi', 'air-conditioning', 'breakfast', 'pool', 'kids-pool', 'private-beach', 'gym', 'spa', 'restaurant', 'bar', 'reception-24h', 'airport-transfer', 'parking', 'safe'],
    units: [
      { code: 'superior', name: 'Superior', description: 'Вид на сад, балкон.', capacity: 2, quantity: 40, price: 1_900_000 },
      { code: 'deluxe-sea', name: 'Deluxe с видом на море', capacity: 2, quantity: 32, price: 2_600_000 },
      { code: 'suite', name: 'Люкс', description: 'Отдельная гостиная, угловой балкон.', capacity: 3, quantity: 12, price: 4_200_000 },
    ],
    images: 6,
  },
  {
    slug: 'duong-dong-city-hotel', title: 'Дуонг Донг Сити',
    short: 'Городской отель рядом с ночным рынком и набережной',
    description: 'Простой и чистый городской отель в центре Дуонг Донга. Пешком до ночного рынка около семи минут, рядом аптеки, обменники и кафе. Подходит как база для поездок по острову: парковка для байков во дворе, стойка работает круглосуточно.',
    area: 'duong-dong', address: '30/4 Street, Duong Dong',
    stars: 3, beachM: 600, centerM: 300, rooms: 40,
    amenities: ['wifi', 'air-conditioning', 'tv', 'breakfast', 'reception-24h', 'laundry', 'parking', 'non-smoking'],
    units: [
      { code: 'standard', name: 'Стандартный номер', capacity: 2, quantity: 24, price: 700_000 },
      { code: 'superior', name: 'Улучшенный номер', description: 'Больше площадь, окно на улицу.', capacity: 2, quantity: 16, price: 950_000 },
    ],
    images: 4,
  },
  {
    slug: 'white-sand-villas', title: 'Уайт Сэнд Виллы',
    short: 'Виллы с личным бассейном в шаге от белого песка Бай Сао',
    description: 'Комплекс частных вилл рядом с Бай Сао — пляжем с самым белым песком на острове. У каждой виллы свой бассейн и закрытый двор. Есть вариант с прямым выходом на пляж. Ресторан работает по меню на заказ, трансфер из аэропорта включён в тариф.',
    area: 'bai-sao', address: 'Bai Sao Beach, An Thoi', featured: true,
    stars: 5, beachM: 0, centerM: 26000, rooms: 18,
    amenities: ['wifi', 'air-conditioning', 'pool', 'private-beach', 'spa', 'restaurant', 'bar', 'airport-transfer', 'reception-24h', 'safe', 'minibar', 'balcony'],
    units: [
      { code: 'pool-villa-1br', name: 'Вилла с бассейном, 1 спальня', capacity: 2, quantity: 10, price: 6_500_000 },
      { code: 'pool-villa-2br', name: 'Вилла с бассейном, 2 спальни', capacity: 4, quantity: 6, price: 9_800_000 },
      { code: 'beachfront-villa', name: 'Вилла на первой линии', description: 'Выход с террасы прямо на песок.', capacity: 4, quantity: 2, price: 14_000_000 },
    ],
    images: 6,
  },
  {
    slug: 'an-thoi-harbour-inn', title: 'Ан Тхой Харбор Инн',
    short: 'Недорогой отель у порта, откуда уходят катера на острова',
    description: 'Экономичный вариант в Ан Тхое, в нескольких минутах от порта. Удобно, если утром выходить на катере к архипелагу или подниматься на канатную дорогу. Номера простые, но с кондиционером и горячей водой. Хозяева помогают с билетами на экскурсии.',
    area: 'an-thoi', address: 'An Thoi Port area',
    stars: 2, beachM: 350, centerM: 25000, rooms: 16,
    amenities: ['wifi', 'air-conditioning', 'tv', 'parking', 'tour-desk'],
    units: [
      { code: 'standard', name: 'Двухместный номер', capacity: 2, quantity: 12, price: 480_000 },
      { code: 'twin', name: 'Номер с двумя кроватями', capacity: 2, quantity: 4, price: 560_000 },
    ],
    images: 3,
  },
  {
    slug: 'mango-tree-guesthouse', title: 'Гестхаус «Манговое дерево»',
    short: 'Семейный гестхаус с общей кухней в жилом квартале Дуонг Донга',
    description: 'Маленький семейный гестхаус на десять номеров в спокойном жилом квартале. Есть общая кухня, где можно готовить самим, и двор с манговым деревом, давшим название. Хозяйка говорит по-английски и помогает с арендой байка. Можно с некрупными животными.',
    area: 'duong-dong', address: 'Tran Hung Dao, Duong Dong',
    beachM: 900, centerM: 1200, rooms: 10,
    amenities: ['wifi', 'air-conditioning', 'kitchenette', 'laundry', 'parking', 'pet-friendly', 'free-cancel'],
    units: [
      { code: 'double', name: 'Двухместный номер', capacity: 2, quantity: 6, price: 420_000 },
      { code: 'triple', name: 'Трёхместный номер', capacity: 3, quantity: 4, price: 580_000 },
    ],
    images: 3,
  },
  {
    slug: 'pepper-hill-retreat', title: 'Пеппер Хилл Ретрит',
    short: 'Отель среди перечных плантаций на севере острова',
    description: 'Отель стоит на холме среди перечных плантаций, которыми Фукуок известен не меньше, чем пляжами. До моря около получаса пешком или пять минут на байке. Бассейн с видом на долину, по утрам подают завтрак с местными фруктами. Тихо, ночью слышно только цикад.',
    area: 'cua-can', address: 'Cua Can, Duong Bao Hill',
    stars: 4, beachM: 2500, centerM: 14000, rooms: 22,
    amenities: ['wifi', 'air-conditioning', 'breakfast', 'pool', 'restaurant', 'spa', 'parking', 'tour-desk', 'family-rooms', 'balcony'],
    units: [
      { code: 'garden-room', name: 'Номер с видом на сад', capacity: 2, quantity: 12, price: 1_600_000 },
      { code: 'pepper-suite', name: 'Люкс с видом на плантации', capacity: 2, quantity: 8, price: 2_400_000 },
      { code: 'family', name: 'Семейный номер', capacity: 4, quantity: 2, price: 3_100_000 },
    ],
    images: 5,
  },
  {
    slug: 'blue-lagoon-resort', title: 'Блю Лагун Резорт',
    short: 'Большой курорт в Онг Ланге с бассейном-лагуной',
    description: 'Курорт средних размеров с бассейном сложной формы, за который его и назвали лагуной. До воды пятьдесят метров по дорожке через сад. Работает детский клуб и два ресторана. Хороший компромисс между инфраструктурой большого курорта и спокойствием Онг Ланга.',
    area: 'ong-lang', address: 'Ong Lang, Cua Duong',
    stars: 4, beachM: 50, centerM: 8000, rooms: 60,
    amenities: ['wifi', 'air-conditioning', 'breakfast', 'pool', 'kids-pool', 'beach-access', 'restaurant', 'bar', 'gym', 'reception-24h', 'airport-transfer', 'family-rooms'],
    units: [
      { code: 'deluxe-garden', name: 'Deluxe с видом на сад', capacity: 2, quantity: 30, price: 1_800_000 },
      { code: 'deluxe-sea', name: 'Deluxe с видом на море', capacity: 2, quantity: 22, price: 2_400_000 },
      { code: 'suite', name: 'Люкс', capacity: 3, quantity: 8, price: 3_600_000 },
    ],
    images: 5,
  },
  {
    slug: 'backpackers-nest-hostel', title: 'Хостел «Бэкпекерс Нест»',
    short: 'Хостел с общими комнатами и баром на крыше',
    description: 'Хостел для самостоятельных путешественников: общие комнаты на четыре и шесть мест, несколько приватных номеров. На крыше бар, где вечером собираются постояльцы. Организуют совместные выезды на снорклинг и к водопадам. Самый бюджетный вариант в подборке.',
    area: 'duong-dong', address: 'Nguyen Trai, Duong Dong',
    beachM: 700, centerM: 500, rooms: 12,
    amenities: ['wifi', 'air-conditioning', 'laundry', 'tour-desk', 'bar', 'non-smoking'],
    units: [
      { code: 'dorm-6', name: 'Место в общей комнате на 6', description: 'Двухъярусные кровати, личный шкафчик и розетка.', capacity: 1, quantity: 24, price: 180_000 },
      { code: 'dorm-4', name: 'Место в общей комнате на 4', capacity: 1, quantity: 12, price: 230_000 },
      { code: 'private-double', name: 'Приватный двухместный номер', capacity: 2, quantity: 4, price: 520_000 },
    ],
    images: 4,
  },
  {
    slug: 'palm-breeze-bungalows', title: 'Палм Бриз Бунгало',
    short: 'Бунгало на Лонг Бич с видом на закат',
    description: 'Ряд бунгало вдоль Лонг Бич, часть из них смотрит прямо на воду. Закат виден с террасы, вставать для этого никуда не нужно. Ресторан работает до позднего вечера, вечером выносят столики на песок. Простая обстановка, но место одно из лучших на пляже.',
    area: 'bai-truong', address: 'Long Beach, Duong To',
    stars: 3, beachM: 80, centerM: 10000, rooms: 18,
    amenities: ['wifi', 'air-conditioning', 'breakfast', 'beach-access', 'restaurant', 'parking', 'laundry', 'balcony'],
    units: [
      { code: 'bungalow-garden', name: 'Бунгало в саду', capacity: 2, quantity: 10, price: 980_000 },
      { code: 'bungalow-sea', name: 'Бунгало с видом на море', capacity: 2, quantity: 8, price: 1_450_000 },
    ],
    images: 4,
  },
  {
    slug: 'emerald-bay-villas', title: 'Эмеральд Бэй Виллы',
    short: 'Виллы на северо-западном мысе с видом на Камбоджу',
    description: 'Виллы на мысе Ган Дау, в ясную погоду с террас видны берега Камбоджи. Собственный участок пляжа, спа и ресторан с морской кухней. Самый удалённый от аэропорта вариант в подборке — около часа дороги, трансфер организуют. Место для тех, кто едет за уединением.',
    area: 'ganh-dau', address: 'Ganh Dau Cape', featured: true,
    stars: 5, beachM: 0, centerM: 30000, rooms: 14,
    amenities: ['wifi', 'air-conditioning', 'pool', 'private-beach', 'spa', 'restaurant', 'bar', 'airport-transfer', 'safe', 'minibar', 'balcony', 'gym'],
    units: [
      { code: 'ocean-villa', name: 'Вилла с видом на океан', capacity: 2, quantity: 8, price: 7_200_000 },
      { code: 'grand-villa', name: 'Гранд-вилла, 3 спальни', capacity: 6, quantity: 6, price: 15_500_000 },
    ],
    images: 6,
  },
  {
    slug: 'night-market-boutique', title: 'Найт Маркет Бутик',
    short: 'Бутик-отель в минуте от ночного рынка',
    description: 'Небольшой бутик-отель прямо у ночного рынка Дуонг Донга. Половина номеров с балконами, выходящими во внутренний двор — на улицу окна не смотрят, поэтому шум рынка не мешает. Завтрак подают до одиннадцати, что удобно после поздних прогулок.',
    area: 'duong-dong', address: 'Bach Dang, Duong Dong',
    stars: 3, beachM: 500, centerM: 100, rooms: 28,
    amenities: ['wifi', 'air-conditioning', 'tv', 'breakfast', 'reception-24h', 'balcony', 'non-smoking', 'laundry'],
    units: [
      { code: 'standard', name: 'Стандартный номер', capacity: 2, quantity: 18, price: 820_000 },
      { code: 'superior-balcony', name: 'Номер с балконом', capacity: 2, quantity: 10, price: 1_100_000 },
    ],
    images: 4,
  },
  {
    slug: 'starfish-beach-camp', title: 'Старфиш Бич Кэмп',
    short: 'Глэмпинг в палатках-сафари на берегу в Куа Кане',
    description: 'Кемпинг формата глэмпинг: палатки-сафари на деревянных настилах, внутри настоящие кровати и вентиляторы. Общий душ и туалет в отдельном блоке. Вечером разводят костёр на песке. Вариант для тех, кто хочет ночевать почти на природе, но без спальника.',
    area: 'cua-can', address: 'Cua Can Beach',
    status: ListingStatus.DRAFT,
    beachM: 0, centerM: 16000, rooms: 15,
    amenities: ['wifi', 'breakfast', 'beach-access', 'restaurant', 'bar', 'family-rooms', 'parking'],
    units: [
      { code: 'safari-tent', name: 'Палатка-сафари на двоих', capacity: 2, quantity: 10, price: 1_250_000 },
      { code: 'family-tent', name: 'Семейная палатка', capacity: 4, quantity: 5, price: 1_850_000 },
    ],
    images: 3,
  },
  {
    slug: 'golden-sunset-hotel', title: 'Голден Сансет',
    short: 'Отель на Лонг Бич с большим бассейном и детской зоной',
    description: 'Отель на 72 номера в средней части Лонг Бич. Большой бассейн с отдельной детской чашей, тренажёрный зал, два ресторана. До пляжа сто пятьдесят метров через дорогу. Один из немногих вариантов в этом ценовом сегменте с полноценными семейными люксами.',
    area: 'bai-truong', address: 'Tran Hung Dao, Duong To',
    stars: 4, beachM: 150, centerM: 6000, rooms: 72,
    amenities: ['wifi', 'air-conditioning', 'breakfast', 'pool', 'kids-pool', 'restaurant', 'bar', 'gym', 'reception-24h', 'parking', 'family-rooms'],
    units: [
      { code: 'standard', name: 'Стандартный номер', capacity: 2, quantity: 36, price: 1_500_000 },
      { code: 'deluxe', name: 'Deluxe', capacity: 2, quantity: 26, price: 2_100_000 },
      { code: 'family-suite', name: 'Семейный люкс', capacity: 4, quantity: 10, price: 3_400_000 },
    ],
    images: 5,
  },
  {
    slug: 'fisherman-house', title: 'Дом рыбака',
    short: 'Восемь номеров в рыбацкой деревне рядом с портом',
    description: 'Небольшой дом на восемь номеров в рыбацкой части Ан Тхоя. Хозяин — бывший рыбак, договаривается о выходах в море на лодке. Утром рядом работает рыбный рынок. Условия простые: кондиционер, горячая вода, общая кухня.',
    area: 'an-thoi', address: 'An Thoi fishing village',
    beachM: 200, centerM: 24000, rooms: 8,
    amenities: ['wifi', 'air-conditioning', 'kitchenette', 'parking', 'tour-desk'],
    units: [
      { code: 'double', name: 'Двухместный номер', capacity: 2, quantity: 6, price: 450_000 },
      { code: 'family', name: 'Семейный номер', capacity: 4, quantity: 2, price: 700_000 },
    ],
    images: 3,
  },
  {
    slug: 'cashew-grove-resort', title: 'Кэшью Гроув Резорт',
    short: 'Курорт в ореховой роще с виллами и спа',
    description: 'Курорт разбит в роще кешью, между корпусами оставлены старые деревья. Часть номеров с прямым выходом к бассейну. Спа работает до девяти вечера, есть отдельные виллы для семей. До пляжа Онг Ланг около четверти километра по тенистой дорожке.',
    area: 'ong-lang', address: 'Ong Lang, Cua Duong',
    stars: 4, beachM: 250, centerM: 8500, rooms: 44,
    amenities: ['wifi', 'air-conditioning', 'breakfast', 'pool', 'spa', 'restaurant', 'bar', 'parking', 'tour-desk', 'airport-transfer', 'balcony'],
    units: [
      { code: 'garden-deluxe', name: 'Deluxe в саду', capacity: 2, quantity: 26, price: 1_700_000 },
      { code: 'pool-access', name: 'Номер с выходом к бассейну', capacity: 2, quantity: 14, price: 2_500_000 },
      { code: 'villa', name: 'Вилла', capacity: 4, quantity: 4, price: 4_800_000 },
    ],
    images: 5,
  },
  {
    slug: 'southern-cape-villas', title: 'Саутерн Кейп Виллы',
    short: 'Двенадцать вилл на скалистом мысе рядом с Бай Сао',
    description: 'Двенадцать вилл на скалистом мысе южнее Бай Сао. Спуск к воде по деревянной лестнице, внизу маленькая бухта, которой пользуются только гости. Есть президентская вилла на шесть человек с отдельным поваром. Самый дорогой объект в подборке.',
    area: 'bai-sao', address: 'Southern Cape, An Thoi',
    stars: 5, beachM: 0, centerM: 27000, rooms: 12,
    amenities: ['wifi', 'air-conditioning', 'pool', 'private-beach', 'spa', 'restaurant', 'bar', 'airport-transfer', 'safe', 'minibar', 'balcony'],
    units: [
      { code: 'sea-view-villa', name: 'Вилла с видом на море', capacity: 2, quantity: 8, price: 8_400_000 },
      { code: 'presidential', name: 'Президентская вилла', description: 'Три спальни, свой повар и бассейн 12 метров.', capacity: 6, quantity: 4, price: 18_000_000 },
    ],
    images: 6,
  },
  {
    slug: 'river-side-lodge', title: 'Риверсайд Лодж',
    short: 'Лодж на берегу реки Куа Кан, каяки для гостей',
    description: 'Лодж стоит на берегу реки, а не на море: до пляжа около двух километров. Для гостей бесплатные каяки — по реке можно подняться в мангровые заросли. Тихое место, подходит для длинных остановок. Можно с животными.',
    area: 'cua-can', address: 'Cua Can River',
    status: ListingStatus.ARCHIVED,
    stars: 3, beachM: 1800, centerM: 15000, rooms: 20,
    amenities: ['wifi', 'air-conditioning', 'breakfast', 'restaurant', 'parking', 'pet-friendly'],
    units: [
      { code: 'standard', name: 'Стандартный номер', capacity: 2, quantity: 14, price: 760_000 },
      { code: 'river-view', name: 'Номер с видом на реку', capacity: 2, quantity: 6, price: 1_050_000 },
    ],
    images: 3,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  БАЙКИ — 12
// ═══════════════════════════════════════════════════════════════════════════

type Bike = {
  slug: string; title: string; short: string; description: string;
  area: string; address: string;
  status?: ListingStatus; featured?: boolean;
  brand: string; model: string; cc: number; transmission: Transmission; year: number;
  /** Минорные единицы: для VND это донги, для USD — центы. */
  deposit: number; depositCurrency: 'VND' | 'USD';
  helmets: number; delivery: boolean; deliveryFee?: number;
  amenities: string[]; units: Unit[]; images: number;
};

const BIKES: Bike[] = [
  {
    slug: 'honda-vision-110', title: 'Honda Vision 110',
    short: 'Самый популярный скутер острова: лёгкий, экономичный, для новичков',
    description: 'Honda Vision — то, на чём ездит половина острова. Лёгкий автоматический скутер, прощает ошибки новичкам и почти не расходует бензин: полного бака хватает на несколько дней катания. Под сиденьем помещается шлем и небольшой рюкзак. Оптимальный выбор для первой аренды.',
    area: 'duong-dong', address: 'Tran Hung Dao, Duong Dong', featured: true,
    brand: 'Honda', model: 'Vision 110', cc: 110, transmission: Transmission.AUTOMATIC, year: 2023,
    deposit: 2_000_000, depositCurrency: 'VND',
    helmets: 2, delivery: true, deliveryFee: 50_000,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'delivery', 'free-cancel'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 8, price: 150_000, minDuration: 1 },
      { code: 'weekly', name: 'От 7 дней', description: 'Цена за сутки при аренде от недели.', capacity: 2, quantity: 8, price: 120_000, minDuration: 7 },
    ],
    images: 4,
  },
  {
    slug: 'honda-air-blade-125', title: 'Honda Air Blade 125',
    short: 'Мощнее Vision, увереннее держит дорогу на трассе к югу',
    description: 'Air Blade заметно живее Vision за счёт 125 кубиков — разница чувствуется на длинной трассе к Ан Тхою и на подъёмах. Жёсткая подвеска и хорошая устойчивость. Подойдёт тем, кто планирует объехать остров целиком, а не только кататься по городу.',
    area: 'duong-dong', address: 'Tran Hung Dao, Duong Dong',
    brand: 'Honda', model: 'Air Blade 125', cc: 125, transmission: Transmission.AUTOMATIC, year: 2023,
    deposit: 2_500_000, depositCurrency: 'VND',
    helmets: 2, delivery: true, deliveryFee: 50_000,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'usb-charger', 'delivery'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 6, price: 180_000, minDuration: 1 },
      { code: 'weekly', name: 'От 7 дней', capacity: 2, quantity: 6, price: 150_000, minDuration: 7 },
    ],
    images: 3,
  },
  {
    slug: 'honda-wave-alpha-110', title: 'Honda Wave Alpha 110',
    short: 'Полуавтомат без сцепления — самый дешёвый вариант',
    description: 'Wave Alpha — рабочая лошадка Вьетнама. Полуавтоматическая коробка: передачи переключаются ногой, но рычага сцепления нет. Багажника под сиденьем почти нет, зато расход минимальный и ремонтируют его в любой мастерской. Самая низкая цена в парке.',
    area: 'duong-dong', address: 'Nguyen Trung Truc, Duong Dong',
    brand: 'Honda', model: 'Wave Alpha 110', cc: 110, transmission: Transmission.SEMI_AUTOMATIC, year: 2022,
    deposit: 1_500_000, depositCurrency: 'VND',
    helmets: 2, delivery: false,
    amenities: ['helmet-included', 'raincoat'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 10, price: 120_000, minDuration: 1 },
    ],
    images: 3,
  },
  {
    slug: 'yamaha-janus-125', title: 'Yamaha Janus 125',
    short: 'Лёгкий скутер с большим подсиденьем и низким сиденьем',
    description: 'Janus легче большинства скутеров в классе, при этом с объёмным подсиденьем — влезают два шлема. Низкое сиденье удобно, если рост невысокий. Экономичный мотор, спокойная динамика. Хороший вариант для поездок вдвоём по городу и ближним пляжам.',
    area: 'bai-truong', address: 'Long Beach, Duong To',
    brand: 'Yamaha', model: 'Janus 125', cc: 125, transmission: Transmission.AUTOMATIC, year: 2023,
    deposit: 2_200_000, depositCurrency: 'VND',
    helmets: 2, delivery: true, deliveryFee: 60_000,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'delivery', 'free-cancel'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 5, price: 170_000, minDuration: 1 },
      { code: 'weekly', name: 'От 7 дней', capacity: 2, quantity: 5, price: 140_000, minDuration: 7 },
    ],
    images: 3,
  },
  {
    slug: 'yamaha-nvx-155', title: 'Yamaha NVX 155',
    short: 'Спортивный макси-скутер с ABS для дальних поездок',
    description: 'NVX — уже почти макси-скутер: 155 кубиков, ABS на переднем колесе, жёсткая рама. Уверенно идёт по трассе на скорости, за которую на мелких скутерах страшно. Тяжелее остальных, в плотном городском трафике менее поворотлив. Для дальних выездов лучший вариант в парке.',
    area: 'bai-truong', address: 'Long Beach, Duong To',
    brand: 'Yamaha', model: 'NVX 155', cc: 155, transmission: Transmission.AUTOMATIC, year: 2024,
    deposit: 15000, depositCurrency: 'USD',
    helmets: 2, delivery: true, deliveryFee: 60_000,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'usb-charger', 'top-case', 'delivery', 'insurance-basic'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 4, price: 250_000, minDuration: 1 },
    ],
    images: 4,
  },
  {
    slug: 'honda-vario-160', title: 'Honda Vario 160',
    short: 'Тяговитый скутер, легко тянет двоих в горку',
    description: 'Vario 160 — про запас мощности. Двоих с багажом тянет в любую горку без усилий, что заметно на дороге к Ган Дау. Просторная площадка для ног, есть USB-розетка. Один из самых востребованных байков в высокий сезон, стоит бронировать заранее.',
    area: 'duong-dong', address: 'Tran Hung Dao, Duong Dong', featured: true,
    brand: 'Honda', model: 'Vario 160', cc: 160, transmission: Transmission.AUTOMATIC, year: 2024,
    deposit: 15000, depositCurrency: 'USD',
    helmets: 2, delivery: true, deliveryFee: 50_000,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'usb-charger', 'delivery', 'insurance-basic', 'free-cancel'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 6, price: 260_000, minDuration: 1 },
      { code: 'weekly', name: 'От 7 дней', capacity: 2, quantity: 6, price: 220_000, minDuration: 7 },
    ],
    images: 4,
  },
  {
    slug: 'honda-winner-x-150', title: 'Honda Winner X 150',
    short: 'Механика с полноценным сцеплением, нужен опыт',
    description: 'Winner X — мотоцикл с настоящей механической коробкой и рычагом сцепления. Требует опыта: новичкам его в аренду обычно не дают. Взамен даёт хорошую динамику и управляемость на серпантинах северной части острова. Права категории A желательны.',
    area: 'duong-dong', address: 'Nguyen Trung Truc, Duong Dong',
    brand: 'Honda', model: 'Winner X 150', cc: 150, transmission: Transmission.MANUAL, year: 2023,
    deposit: 15000, depositCurrency: 'USD',
    helmets: 2, delivery: false,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'insurance-basic'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 3, price: 280_000, minDuration: 1 },
    ],
    images: 3,
  },
  {
    slug: 'yamaha-exciter-155', title: 'Yamaha Exciter 155',
    short: 'Самый резвый мотоцикл в парке, для уверенных водителей',
    description: 'Exciter 155 с жидкостным охлаждением и шестиступенчатой коробкой — самый быстрый вариант в подборке. Посадка спортивная, подвеска жёсткая. Берут те, кто ездит на мотоцикле дома и хочет то же самое здесь. Новичкам не рекомендуется.',
    area: 'duong-dong', address: 'Nguyen Trung Truc, Duong Dong',
    brand: 'Yamaha', model: 'Exciter 155', cc: 155, transmission: Transmission.MANUAL, year: 2024,
    deposit: 20000, depositCurrency: 'USD',
    helmets: 2, delivery: false,
    amenities: ['helmet-included', 'phone-holder', 'insurance-basic'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 3, price: 300_000, minDuration: 1 },
    ],
    images: 3,
  },
  {
    slug: 'honda-sh-mode-125', title: 'Honda SH Mode 125',
    short: 'Скутер с большими колёсами — мягче на разбитой дороге',
    description: 'SH Mode отличается большими колёсами: разбитые участки грунтовок на севере проходит заметно мягче обычных скутеров. Высокая посадка, хороший обзор в потоке. Дороже за счёт комфорта, но на длинных дистанциях разница окупается.',
    area: 'ong-lang', address: 'Ong Lang, Cua Duong',
    brand: 'Honda', model: 'SH Mode 125', cc: 125, transmission: Transmission.AUTOMATIC, year: 2023,
    deposit: 15000, depositCurrency: 'USD',
    helmets: 2, delivery: true, deliveryFee: 80_000,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'usb-charger', 'delivery', 'free-cancel'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 4, price: 320_000, minDuration: 1 },
    ],
    images: 3,
  },
  {
    slug: 'honda-adv-160', title: 'Honda ADV 160',
    short: 'Приключенческий скутер с длинноходной подвеской',
    description: 'ADV 160 сделан для плохих дорог: длинноходная подвеска, защита, высокий клиренс. На грунтовках к диким пляжам севера чувствует себя лучше любого другого скутера в парке. Минимальный срок аренды — двое суток. Всего две машины, бронируют заранее.',
    area: 'ong-lang', address: 'Ong Lang, Cua Duong',
    brand: 'Honda', model: 'ADV 160', cc: 160, transmission: Transmission.AUTOMATIC, year: 2024,
    deposit: 25000, depositCurrency: 'USD',
    helmets: 2, delivery: true, deliveryFee: 80_000,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'usb-charger', 'top-case', 'delivery', 'insurance-basic'],
    units: [
      { code: 'daily', name: 'Посуточно, от 2 дней', capacity: 2, quantity: 2, price: 450_000, minDuration: 2 },
    ],
    images: 4,
  },
  {
    slug: 'honda-xr-150l', title: 'Honda XR 150L',
    short: 'Лёгкий эндуро для грунтовок и джунглей',
    description: 'Единственный эндуро в парке. Высокая посадка, внедорожная резина, механическая коробка. Нужен для маршрутов по грунтовкам национального парка, куда на скутере лучше не соваться. Требует опыта езды на механике и прав категории A.',
    area: 'duong-dong', address: 'Nguyen Trung Truc, Duong Dong',
    status: ListingStatus.DRAFT,
    brand: 'Honda', model: 'XR 150L', cc: 150, transmission: Transmission.MANUAL, year: 2022,
    deposit: 30000, depositCurrency: 'USD',
    helmets: 1, delivery: false,
    amenities: ['helmet-included', 'insurance-basic'],
    units: [
      { code: 'daily', name: 'Посуточно, от 2 дней', capacity: 2, quantity: 2, price: 500_000, minDuration: 2 },
    ],
    images: 3,
  },
  {
    slug: 'yamaha-grande-125', title: 'Yamaha Grande 125',
    short: 'Тихий гибридный скутер с системой старт-стоп',
    description: 'Grande с гибридной системой: мотор глушится на светофорах и запускается бесшумно. Самый экономичный скутер в парке по расходу. Мягкое широкое сиденье, удобно вдвоём. Подходит для спокойной езды по городу и вдоль Лонг Бич.',
    area: 'bai-truong', address: 'Long Beach, Duong To',
    brand: 'Yamaha', model: 'Grande 125', cc: 125, transmission: Transmission.AUTOMATIC, year: 2023,
    deposit: 2_500_000, depositCurrency: 'VND',
    helmets: 2, delivery: true, deliveryFee: 60_000,
    amenities: ['helmet-included', 'raincoat', 'phone-holder', 'usb-charger', 'delivery', 'free-cancel'],
    units: [
      { code: 'daily', name: 'Посуточно', capacity: 2, quantity: 5, price: 200_000, minDuration: 1 },
      { code: 'weekly', name: 'От 7 дней', capacity: 2, quantity: 5, price: 165_000, minDuration: 7 },
    ],
    images: 3,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
//  ПОЛЬЗОВАТЕЛИ
// ═══════════════════════════════════════════════════════════════════════════

const USERS = [
  { email: 'admin@phuquoc.demo',    name: 'Администратор платформы', role: 'ADMIN',   phone: '+84901000001' },
  { email: 'manager@phuquoc.demo',  name: 'Анна Соколова',           role: 'MANAGER', phone: '+84901000002' },
  { email: 'manager2@phuquoc.demo', name: 'Дмитрий Ким',             role: 'MANAGER', phone: '+84901000003' },
  { email: 'ivan@example.com',      name: 'Иван Петров',             role: 'USER',    phone: '+79161234567' },
  { email: 'maria@example.com',     name: 'Мария Ильина',            role: 'USER',    phone: '+79031112233' },
  { email: 'alex@example.com',      name: 'Алексей Гордеев',         role: 'USER',    phone: '+79852223344' },
  { email: 'olga@example.com',      name: 'Ольга Наумова',           role: 'USER',    phone: '+79263334455' },
] as const;

// ═══════════════════════════════════════════════════════════════════════════
//  ОЧИСТКА
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Порядок обязателен: RESTRICT-связи не дают удалить родителя раньше детей.
 * Listing уходит до Area, ListingImage до MediaAsset, RequestNote до User.
 */
async function wipe() {
  await prisma.requestNote.deleteMany();
  await prisma.request.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.listingImage.deleteMany();
  await prisma.listingAmenity.deleteMany();
  await prisma.listingUnitTranslation.deleteMany();
  await prisma.listingUnit.deleteMany();
  await prisma.listingTranslation.deleteMany();
  await prisma.hotelDetails.deleteMany();
  await prisma.bikeDetails.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.amenityTranslation.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.areaTranslation.deleteMany();
  await prisma.area.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userToken.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.user.deleteMany();
}

// ═══════════════════════════════════════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНОЕ
// ═══════════════════════════════════════════════════════════════════════════

/** Стабильные демо-изображения. Реальные фото загружаются через админку. */
function demoImage(slug: string, i: number) {
  return {
    storageKey: `demo/${slug}/${i + 1}.jpg`,
    url: `https://picsum.photos/seed/${slug}-${i + 1}/1600/900`,
    mime: 'image/jpeg',
    width: 1600,
    height: 900,
    sizeBytes: 180_000 + i * 12_000,
    blurDataUrl: BLUR,
  };
}

/** То же правило, которое затем реализует service layer при правке юнитов. */
function priceFrom(units: Unit[]): bigint {
  return BigInt(Math.min(...units.map((u) => u.price)));
}

/** Доступ по ключу с внятной ошибкой вместо undefined, просочившегося в базу. */
function must<T>(map: Record<string, T>, key: string, what: string): T {
  const value = map[key];
  if (value === undefined) throw new Error(`${what} не найден в сиде: ${key}`);
  return value;
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// ═══════════════════════════════════════════════════════════════════════════
//  ОСНОВНОЙ СЦЕНАРИЙ
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('Очистка...');
  await wipe();

  // ── пользователи ──────────────────────────────────────────────────────────
  const passwordHash = hashSync(DEMO_PASSWORD, { algorithm: 2 }); // 2 = argon2id
  const users: Record<string, string> = {};

  for (const u of USERS) {
    const created = await prisma.user.create({
      data: {
        email: u.email.toLowerCase(),
        passwordHash,
        name: u.name,
        phone: u.phone,
        phoneNormalized: u.phone,
        role: u.role as Prisma.UserCreateInput['role'],
        emailVerifiedAt: new Date(),
      },
    });
    users[u.email] = created.id;
  }
  console.log(`Пользователей: ${USERS.length}`);

  // ── районы ────────────────────────────────────────────────────────────────
  const areas: Record<string, string> = {};
  for (const [i, a] of AREAS.entries()) {
    const created = await prisma.area.create({
      data: {
        slug: a.slug,
        lat: new Prisma.Decimal(a.lat),
        lng: new Prisma.Decimal(a.lng),
        sortOrder: i,
        translations: { create: [{ locale: 'RU', name: a.name, description: a.description }] },
      },
    });
    areas[a.slug] = created.id;
  }
  console.log(`Районов: ${AREAS.length}`);

  // ── удобства ──────────────────────────────────────────────────────────────
  const amenities: Record<string, string> = {};
  for (const [i, a] of AMENITIES.entries()) {
    const created = await prisma.amenity.create({
      data: {
        code: a.code,
        scope: a.scope,
        group: a.group,
        sortOrder: i,
        translations: { create: [{ locale: 'RU', name: a.name }] },
      },
    });
    amenities[a.code] = created.id;
  }
  console.log(`Удобств и опций: ${AMENITIES.length}`);

  // ── изображения объекта ───────────────────────────────────────────────────
  const attachImages = async (listingId: string, slug: string, title: string, n: number) => {
    for (let i = 0; i < n; i++) {
      const media = await prisma.mediaAsset.create({
        data: { ...demoImage(slug, i), uploadedById: must(users, 'admin@phuquoc.demo', 'Пользователь') },
      });
      await prisma.listingImage.create({
        data: {
          listingId,
          mediaId: media.id,
          alt: `${title} — фото ${i + 1}`,
          sortOrder: i,
          isCover: i === 0, // ровно одна обложка на объект
        },
      });
    }
  };

  const unitData = (units: Unit[], priceUnit: 'NIGHT' | 'DAY') =>
    units.map((u, i) => ({
      code: u.code,
      capacity: u.capacity,
      quantity: u.quantity,
      priceAmount: BigInt(u.price),
      priceUnit,
      minDuration: u.minDuration ?? 1,
      sortOrder: i,
      translations: { create: [{ locale: 'RU' as const, name: u.name, description: u.description }] },
    }));

  // ── отели ─────────────────────────────────────────────────────────────────
  const listingIds: Record<string, string> = {};

  for (const [i, h] of HOTELS.entries()) {
    const status = h.status ?? ListingStatus.PUBLISHED;
    const created = await prisma.listing.create({
      data: {
        type: 'HOTEL',
        slug: h.slug,
        status,
        isFeatured: h.featured ?? false,
        sortOrder: i,
        areaId: must(areas, h.area, 'Район'),
        address: h.address,
        priceFromAmount: priceFrom(h.units),
        currency: 'VND',
        publishedAt: status === ListingStatus.PUBLISHED ? daysFromNow(-30 + i) : null,
        translations: {
          create: [{ locale: 'RU', title: h.title, shortDescription: h.short, description: h.description }],
        },
        hotelDetails: {
          create: {
            stars: h.stars,
            checkInTime: '14:00',
            checkOutTime: '12:00',
            distanceToBeachM: h.beachM,
            distanceToCenterM: h.centerM,
            totalRooms: h.rooms,
          },
        },
        units: { create: unitData(h.units, 'NIGHT') },
        amenities: { create: h.amenities.map((c) => ({ amenityId: must(amenities, c, 'Удобство') })) },
      },
    });
    listingIds[h.slug] = created.id;
    await attachImages(created.id, h.slug, h.title, h.images);
  }
  console.log(`Отелей: ${HOTELS.length}`);

  // ── байки ─────────────────────────────────────────────────────────────────
  for (const [i, b] of BIKES.entries()) {
    const status = b.status ?? ListingStatus.PUBLISHED;
    const created = await prisma.listing.create({
      data: {
        type: 'BIKE',
        slug: b.slug,
        status,
        isFeatured: b.featured ?? false,
        sortOrder: i,
        areaId: must(areas, b.area, 'Район'),
        address: b.address,
        priceFromAmount: priceFrom(b.units),
        currency: 'VND',
        publishedAt: status === ListingStatus.PUBLISHED ? daysFromNow(-20 + i) : null,
        translations: {
          create: [{ locale: 'RU', title: b.title, shortDescription: b.short, description: b.description }],
        },
        bikeDetails: {
          create: {
            brand: b.brand,
            model: b.model,
            engineCc: b.cc,
            transmission: b.transmission,
            year: b.year,
            depositAmount: BigInt(b.deposit),
            depositCurrency: b.depositCurrency,
            helmetsIncluded: b.helmets,
            deliveryIncluded: b.delivery,
            deliveryFeeAmount: b.deliveryFee ? BigInt(b.deliveryFee) : null,
          },
        },
        units: { create: unitData(b.units, 'DAY') },
        amenities: { create: b.amenities.map((c) => ({ amenityId: must(amenities, c, 'Удобство') })) },
      },
    });
    listingIds[b.slug] = created.id;
    await attachImages(created.id, b.slug, b.title, b.images);
  }
  console.log(`Байков: ${BIKES.length}`);

  // ── избранное ─────────────────────────────────────────────────────────────
  await prisma.favorite.createMany({
    data: [
      { userId: must(users, 'ivan@example.com', 'Пользователь'), listingId: must(listingIds, 'sunset-sands-resort', 'Объект') },
      { userId: must(users, 'ivan@example.com', 'Пользователь'), listingId: must(listingIds, 'honda-vision-110', 'Объект') },
      { userId: must(users, 'maria@example.com', 'Пользователь'), listingId: must(listingIds, 'white-sand-villas', 'Объект') },
      { userId: must(users, 'maria@example.com', 'Пользователь'), listingId: must(listingIds, 'coco-garden-bungalows', 'Объект') },
      { userId: must(users, 'alex@example.com', 'Пользователь'), listingId: must(listingIds, 'honda-adv-160', 'Объект') },
    ],
  });

  // ── заявки ────────────────────────────────────────────────────────────────
  const unitOf = async (slug: string, code: string) =>
    (await prisma.listingUnit.findFirst({
      where: { listing: { slug }, code },
      select: { id: true },
    }))!.id;

  const REQUESTS = [
    {
      publicCode: 'PQ-7K2M4', type: 'HOTEL' as const, status: 'NEW' as const,
      listing: 'sunset-sands-resort', unit: 'deluxe-sea', user: 'ivan@example.com',
      name: 'Иван Петров', phone: '+79161234567', email: 'ivan@example.com',
      messenger: 'TELEGRAM' as const, handle: '@ivan_petrov',
      from: 12, to: 19, guests: 2, comment: 'Хотим номер повыше, если есть возможность. Прилетаем вечером.',
      assignee: null, notes: [] as string[],
    },
    {
      publicCode: 'PQ-3F8Q1', type: 'BIKE' as const, status: 'IN_PROGRESS' as const,
      listing: 'honda-vario-160', unit: 'weekly', user: 'alex@example.com',
      name: 'Алексей Гордеев', phone: '+79852223344', email: 'alex@example.com',
      messenger: 'WHATSAPP' as const, handle: '+79852223344',
      from: 5, to: 15, quantity: 1, comment: 'Нужна доставка в отель на Лонг Бич.',
      assignee: 'manager@phuquoc.demo',
      notes: ['Подтвердил наличие на эти даты. Жду ответ по времени доставки.'],
    },
    {
      publicCode: 'PQ-9B5X7', type: 'HOTEL' as const, status: 'CONFIRMED' as const,
      listing: 'white-sand-villas', unit: 'pool-villa-2br', user: 'maria@example.com',
      name: 'Мария Ильина', phone: '+79031112233', email: 'maria@example.com',
      messenger: 'TELEGRAM' as const, handle: '@maria_i',
      from: 30, to: 37, guests: 4, comment: 'Едем семьёй с двумя детьми, нужны две спальни.',
      assignee: 'manager@phuquoc.demo',
      notes: ['Отель подтвердил бронь.', 'Клиент оплатил депозит напрямую отелю, комиссию выставляем в конце месяца.'],
    },
    {
      publicCode: 'PQ-2W6R3', type: 'BIKE' as const, status: 'COMPLETED' as const,
      listing: 'honda-vision-110', unit: 'daily', user: null,
      name: 'Сергей Волков', phone: '+79771234455', email: 'sergey.v@example.com',
      messenger: 'NONE' as const, handle: null,
      from: -14, to: -7, quantity: 2, comment: 'Два байка на неделю, оба автомат.',
      assignee: 'manager2@phuquoc.demo',
      notes: ['Выдали два Vision. Вернули без повреждений.'],
    },
    {
      publicCode: 'PQ-5T1N8', type: 'HOTEL' as const, status: 'CANCELLED' as const,
      listing: 'blue-lagoon-resort', unit: 'deluxe-garden', user: null,
      name: 'Наталья Дроздова', phone: '+79219998877', email: null,
      messenger: 'ZALO' as const, handle: '+79219998877',
      from: 20, to: 24, guests: 2, comment: null,
      assignee: 'manager2@phuquoc.demo',
      notes: ['Клиент передумал лететь, отменяем.'],
    },
    {
      publicCode: 'PQ-8H4L6', type: 'HOTEL' as const, status: 'NEW' as const,
      listing: 'coco-garden-bungalows', unit: 'bungalow', user: null,
      name: 'Павел Дорошенко', phone: '+380671234567', email: 'pavel.d@example.com',
      messenger: 'TELEGRAM' as const, handle: '@pavel_d',
      from: 45, to: 52, guests: 2, comment: 'Есть ли трансфер из аэропорта и сколько стоит?',
      assignee: null, notes: [],
    },
    {
      publicCode: 'PQ-6C9V2', type: 'BIKE' as const, status: 'NEW' as const,
      listing: 'honda-adv-160', unit: 'daily', user: 'olga@example.com',
      name: 'Ольга Наумова', phone: '+79263334455', email: 'olga@example.com',
      messenger: 'TELEGRAM' as const, handle: '@olga_n',
      from: 8, to: 12, quantity: 1, comment: 'Планируем ехать на север по грунтовкам.',
      assignee: null, notes: [],
    },
    {
      publicCode: 'PQ-4D7J9', type: 'GENERAL' as const, status: 'IN_PROGRESS' as const,
      listing: null, unit: null, user: null,
      name: 'Екатерина Лаврова', phone: '+79051119988', email: 'kate.l@example.com',
      messenger: 'WHATSAPP' as const, handle: '+79051119988',
      from: 60, to: 74, guests: 6, comment: 'Ищем виллу на 6 человек на две недели в январе. Что можете предложить?',
      assignee: 'manager@phuquoc.demo',
      notes: ['Отправила подборку из трёх вилл, жду обратной связи.'],
    },
    {
      publicCode: 'PQ-1G3Z5', type: 'HOTEL' as const, status: 'CONFIRMED' as const,
      listing: 'golden-sunset-hotel', unit: 'family-suite', user: null,
      name: 'Артём Белов', phone: '+79119876543', email: 'artem.b@example.com',
      messenger: 'TELEGRAM' as const, handle: '@artem_b',
      from: 25, to: 32, guests: 4, comment: 'Нужна детская кроватка.',
      assignee: 'manager2@phuquoc.demo',
      notes: ['Кроватку отель предоставит бесплатно.'],
    },
    {
      publicCode: 'PQ-0P8S4', type: 'BIKE' as const, status: 'NEW' as const,
      listing: 'yamaha-nvx-155', unit: 'daily', user: null,
      name: 'Динара Сафина', phone: '+77015554433', email: null,
      messenger: 'WHATSAPP' as const, handle: '+77015554433',
      from: 3, to: 6, quantity: 1, comment: null,
      assignee: null, notes: [],
    },
  ];

  for (const r of REQUESTS) {
    const created = await prisma.request.create({
      data: {
        publicCode: r.publicCode,
        type: r.type,
        status: r.status,
        listingId: r.listing ? must(listingIds, r.listing, 'Объект') : null,
        listingUnitId: r.listing && r.unit ? await unitOf(r.listing, r.unit) : null,
        userId: r.user ? must(users, r.user, 'Пользователь') : null,
        contactName: r.name,
        contactPhone: r.phone,
        contactPhoneNormalized: r.phone,
        contactEmail: r.email,
        messenger: r.messenger,
        messengerHandle: r.handle,
        dateFrom: daysFromNow(r.from),
        dateTo: daysFromNow(r.to),
        guests: 'guests' in r ? (r as { guests?: number }).guests : null,
        quantity: 'quantity' in r ? (r as { quantity?: number }).quantity : null,
        comment: r.comment,
        locale: 'RU',
        source: r.listing ? 'WEB_LISTING' : 'WEB_GENERAL',
        utm: r.publicCode === 'PQ-7K2M4'
          ? { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'phuquoc-hotels' }
          : Prisma.DbNull,
        assignedToId: r.assignee ? must(users, r.assignee, 'Пользователь') : null,
      },
    });

    for (const body of r.notes) {
      await prisma.requestNote.create({
        data: {
          requestId: created.id,
          authorId: must(users, r.assignee ?? 'manager@phuquoc.demo', 'Пользователь'),
          body,
        },
      });
    }
  }
  console.log(`Заявок: ${REQUESTS.length}`);

  // ── журнал аудита ─────────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: must(users, 'admin@phuquoc.demo', 'Пользователь'), actorRole: 'ADMIN',
        entity: 'Listing', entityId: must(listingIds, 'sunset-sands-resort', 'Объект'), action: 'publish',
        before: { status: 'DRAFT' }, after: { status: 'PUBLISHED' },
      },
      {
        actorId: must(users, 'manager@phuquoc.demo', 'Пользователь'), actorRole: 'MANAGER',
        entity: 'Request', entityId: 'PQ-9B5X7', action: 'status_change',
        before: { status: 'IN_PROGRESS' }, after: { status: 'CONFIRMED' },
      },
      {
        actorId: must(users, 'admin@phuquoc.demo', 'Пользователь'), actorRole: 'ADMIN',
        entity: 'Listing', entityId: must(listingIds, 'river-side-lodge', 'Объект'), action: 'archive',
        before: { status: 'PUBLISHED' }, after: { status: 'ARCHIVED' },
      },
    ],
  });

  // ── итог ──────────────────────────────────────────────────────────────────
  const [listings, units, images, amenityLinks] = await Promise.all([
    prisma.listing.count(),
    prisma.listingUnit.count(),
    prisma.listingImage.count(),
    prisma.listingAmenity.count(),
  ]);

  console.log(
    `\nГотово. Объектов: ${listings}, юнитов: ${units}, изображений: ${images}, ` +
      `связей с удобствами: ${amenityLinks}.`,
  );
  console.log(`Пароль всех демо-аккаунтов: ${DEMO_PASSWORD}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
