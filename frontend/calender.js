const STORAGE_KEY = "airsCalendarEvents";

const els = {
  monthTitle: document.getElementById("monthTitle"),
  eventCount: document.getElementById("eventCount"),
  prevMonth: document.getElementById("prevMonth"),
  todayBtn: document.getElementById("todayBtn"),
  nextMonth: document.getElementById("nextMonth"),
  calendarGrid: document.getElementById("calendarGrid"),
  selectedDateTitle: document.getElementById("selectedDateTitle"),
  eventList: document.getElementById("eventList"),
};

const state = {
  currentMonth: startOfMonth(new Date()),
  selectedDate: startOfDay(new Date()),
  events: readEvents(),
};

function readEvents() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(events) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseEventDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function sameDate(a, b) {
  return dateKey(a) === dateKey(b);
}

function eventsForDate(date) {
  const key = dateKey(date);
  return state.events
    .filter((event) => dateKey(parseEventDate(event.startedAt)) === key)
    .sort((a, b) => parseEventDate(a.startedAt) - parseEventDate(b.startedAt));
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(date);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function formatTimeRange(event) {
  const start = parseEventDate(event.startedAt);
  const end = parseEventDate(event.endedAt);
  const fmt = new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${fmt.format(start)} - ${fmt.format(end)}`;
}

function render() {
  renderCalendar();
  renderSelectedDate();
}

function renderCalendar() {
  els.monthTitle.textContent = formatMonth(state.currentMonth);
  els.eventCount.textContent = state.events.length
    ? `${state.events.length}件の振り返りを保存中`
    : "保存された振り返りはありません。";
  els.calendarGrid.textContent = "";

  const monthStart = startOfMonth(state.currentMonth);
  const firstCell = new Date(monthStart);
  firstCell.setDate(firstCell.getDate() - firstCell.getDay());

  for (let i = 0; i < 42; i++) {
    const day = new Date(firstCell);
    day.setDate(firstCell.getDate() + i);
    const dayEvents = eventsForDate(day);
    const button = document.createElement("button");
    button.className = "calendar-day";
    button.type = "button";
    button.classList.toggle("outside-month", day.getMonth() !== state.currentMonth.getMonth());
    button.classList.toggle("today", sameDate(day, new Date()));
    button.classList.toggle("selected", sameDate(day, state.selectedDate));

    const num = document.createElement("span");
    num.className = "day-number";
    num.textContent = String(day.getDate());
    button.appendChild(num);

    if (dayEvents.length) {
      const badge = document.createElement("span");
      badge.className = "day-event-count";
      badge.textContent = `${dayEvents.length}件`;
      button.appendChild(badge);
    }

    const previewWrap = document.createElement("span");
    previewWrap.className = "day-event-preview";
    dayEvents.slice(0, 3).forEach(() => {
      const dot = document.createElement("span");
      dot.className = "day-event-dot";
      previewWrap.appendChild(dot);
    });
    button.appendChild(previewWrap);

    button.addEventListener("click", () => {
      state.selectedDate = startOfDay(day);
      if (day.getMonth() !== state.currentMonth.getMonth()) {
        state.currentMonth = startOfMonth(day);
      }
      render();
    });

    els.calendarGrid.appendChild(button);
  }
}

function renderSelectedDate() {
  const events = eventsForDate(state.selectedDate);
  els.selectedDateTitle.textContent = formatDate(state.selectedDate);
  els.eventList.textContent = "";

  if (!events.length) {
    const empty = document.createElement("p");
    empty.className = "empty-events";
    empty.textContent = "この日の振り返りはありません。";
    els.eventList.appendChild(empty);
    return;
  }

  events.forEach((event) => {
    const item = document.createElement("article");
    item.className = "event-item";

    const head = document.createElement("div");
    head.className = "event-item-head";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = event.title || "配信の振り返り";
    const time = document.createElement("p");
    time.textContent = formatTimeRange(event);
    titleWrap.append(title, time);

    const del = document.createElement("button");
    del.className = "event-delete";
    del.type = "button";
    del.textContent = "削除";
    del.addEventListener("click", () => deleteEvent(event.id));

    head.append(titleWrap, del);

    const summary = document.createElement("p");
    summary.className = "event-summary";
    summary.textContent = event.summary || "";

    item.append(head, summary);
    els.eventList.appendChild(item);
  });
}

function deleteEvent(id) {
  state.events = state.events.filter((event) => event.id !== id);
  writeEvents(state.events);
  render();
}

els.prevMonth.addEventListener("click", () => {
  state.currentMonth = addMonths(state.currentMonth, -1);
  render();
});

els.nextMonth.addEventListener("click", () => {
  state.currentMonth = addMonths(state.currentMonth, 1);
  render();
});

els.todayBtn.addEventListener("click", () => {
  state.selectedDate = startOfDay(new Date());
  state.currentMonth = startOfMonth(new Date());
  render();
});

render();
