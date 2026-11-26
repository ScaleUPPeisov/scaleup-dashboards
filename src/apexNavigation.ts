import type {Page} from './types';
export type ApexNavIcon='home'|'channels'|'production'|'inventory'|'youtube'|'analytics'|'competitors'|'settings';
export const apexNavigation:ReadonlyArray<{label:string;items:ReadonlyArray<{page:Page;icon:ApexNavIcon;label:string}>}> = [
  {
    "label": "РАБОЧАЯ СРЕДА",
    "items": [
      {
        "page": "dashboard",
        "icon": "home",
        "label": "Главная"
      },
      {
        "page": "channels",
        "icon": "channels",
        "label": "Каналы"
      },
      {
        "page": "production",
        "icon": "production",
        "label": "Производство"
      },
      {
        "page": "inventory",
        "icon": "inventory",
        "label": "Запас видео"
      }
    ]
  },
  {
    "label": "YOUTUBE",
    "items": [
      {
        "page": "publisher",
        "icon": "youtube",
        "label": "Публикатор"
      },
      {
        "page": "batch",
        "icon": "youtube",
        "label": "Массовая публикация"
      },
      {
        "page": "metadata",
        "icon": "youtube",
        "label": "Метаданные"
      },
      {
        "page": "uploads",
        "icon": "youtube",
        "label": "Центр загрузок"
      },
      {
        "page": "schedule",
        "icon": "youtube",
        "label": "Расписание"
      },
      {
        "page": "existing",
        "icon": "youtube",
        "label": "Загруженные"
      },
      {
        "page": "runway",
        "icon": "youtube",
        "label": "План каналов"
      }
    ]
  },
  {
    "label": "АНАЛИЗ И МАТЕРИАЛЫ",
    "items": [
      {
        "page": "analytics",
        "icon": "analytics",
        "label": "Аналитика 360°"
      },
      {
        "page": "winners",
        "icon": "analytics",
        "label": "Лучшие видео"
      },
      {
        "page": "competitors",
        "icon": "competitors",
        "label": "Конкуренты"
      },
      {
        "page": "images",
        "icon": "production",
        "label": "Изображения"
      },
      {
        "page": "music",
        "icon": "production",
        "label": "Музыка"
      }
    ]
  },
  {
    "label": "СИСТЕМА",
    "items": [
      {
        "page": "autopilot",
        "icon": "home",
        "label": "Командный центр"
      },
      {
        "page": "history",
        "icon": "youtube",
        "label": "История"
      },
      {
        "page": "accounts",
        "icon": "channels",
        "label": "Аккаунты"
      },
      {
        "page": "settings",
        "icon": "settings",
        "label": "Настройки"
      },
      {
        "page": "design",
        "icon": "settings",
        "label": "Дизайн-система"
      }
    ]
  }
];
export function apexActivePage(page:Page):Page{return page==='youtube'?'publisher':page==='content'?'production':page}
export function apexYoutubeRoute(page:Page):'publish'|'metadata'|'uploaded'|'schedule'|'runway'|undefined{
 return page==='publisher'?'publish':page==='metadata'?'metadata':page==='existing'?'uploaded':page==='schedule'?'schedule':page==='runway'?'runway':undefined;
}
