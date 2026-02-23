FROM node:16-buster

# Настройка архивных репозиториев для Debian Buster, если основные недоступны
RUN sed -i 's/deb.debian.org/archive.debian.org/g' /etc/apt/sources.list && \
    sed -i 's|security.debian.org/debian-security|archive.debian.org/debian-security|g' /etc/apt/sources.list && \
    sed -i '/stretch-updates/d' /etc/apt/sources.list

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Создаем симлинк для python, так как многие старые скрипты ищут 'python'
RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app

# Копируем файлы манифестов для кэширования слоев
COPY package.json yarn.lock* ./

# Установка зависимостей с игнорированием конфликтов peer-зависимостей,
# так как Enact и React 17 часто имеют несовпадающие требования у вложенных пакетов.
RUN npm install --legacy-peer-deps

# Копируем остальной код
COPY . .

# Сборка проекта
RUN npm run build

# Упаковка в IPK
RUN npm run package

# Подготовка папок
RUN mkdir -p out build

# По умолчанию ничего не делаем, контейнер используется для извлечения данных через volumes или cp
CMD ["echo", "Build finished. Check the output directory."]
