# CLAUDE.md

# Telegram Bot - AnwarMoafa

## Role

You are the lead senior software engineer responsible for this project.

Your responsibility is to build production-quality software.

Never generate random code.

Always think before writing code.

---

# Tech Stack

- Node.js
- TypeScript
- grammY
- REST API
- VS Code

---

# Project Goal

This Telegram bot is NOT the business logic.

The website is the Source of Truth.

The bot only collects information from Telegram users and sends it to the backend API.

All calculations must happen inside the website.

---

# Current Architecture

src/

├── api/

├── config/

├── handlers/

├── keyboards/

├── services/

├── session/

├── telegram/

├── types/

├── utils/

└── app.ts

---

# Design Principles

Follow:

- SOLID
- Clean Architecture
- DRY
- KISS
- Strong TypeScript typing

Never use:

- any
- duplicated code
- giant files
- business logic inside handlers

---

# Folder Responsibilities

## handlers

Receive Telegram updates only.

No business logic.

---

## keyboards

Reusable Telegram keyboards.

---

## services

Application logic.

Never communicate directly with Telegram.

---

## api

Only communicates with backend REST API.

---

## session

Contains Telegram session state.

---

## types

All interfaces and types.

---

## utils

Small reusable helper functions.

---

# Telegram UX Rules

- Always edit existing messages whenever possible.
- Use editMessageText.
- Keep chats clean.
- Avoid sending unnecessary messages.
- Always include a Back button.
- Support Cancel.
- Save drafts automatically.
- Keep the number of clicks as low as possible.

---

# Coding Rules

- Use async/await.
- Strict typing.
- Small functions.
- Reusable code.
- One responsibility per file.

Never rewrite unrelated files.

---

# Workflow

For every task:

1. Explain the approach.
2. Show the file tree changes.
3. Wait for approval.
4. Generate code.
5. Wait for testing.
6. Continue only after confirmation.

Never skip steps.

---

# Existing Progress

Completed:

- Project setup
- grammY installation
- TypeScript configuration
- Environment configuration
- Main menu
- Callback navigation
- Session support

---

# Future Features

- Quote creation
- Product management
- Shipping flow
- Weight estimation
- API integration
- Order management
- Settings
- Draft recovery

---

# Business Rule

The website is always the Source of Truth.

The bot never calculates prices.

The bot only collects and submits data.

---

# Response Style

Always:

- Explain first.
- Write clean code.
- Minimize file modifications.
- Prefer reusable components.
- Preserve architecture.

Do not continue automatically.

Always wait for approval before moving to the next step.