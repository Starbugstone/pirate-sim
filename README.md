# Pirate Sim App

Standalone React + Three.js pirate combat app rebuilt from the original Starbug pirate sim demo.

## Overview

This project takes the original prototype and turns it into a focused standalone app with:

- a dedicated React app shell
- a playable Three.js pirate simulation
- world, roadmap, and feature pages built from the original design docs
- lazy-loaded game code so non-game pages stay lightweight

## Features

- Procedural open-sea world streaming around the player
- Mouse steering, wind-based sailing, and broadside combat
- Harbour docking, upgrades, repairs, and gold economy
- Enemy ship types with different combat behaviors
- Dedicated product pages for overview, world rules, and roadmap

## Tech Stack

- React
- TypeScript
- Vite
- Three.js
- React Router

## Getting Started

```bash
npm install
npm run dev
```

Open the local Vite URL, then visit `/play` to launch the game.

## Available Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## Project Structure

```text
src/
  components/      App shell and shared layout
  data/            Extracted feature, world, and roadmap content
  game/            Pirate sim React wrapper and game styling
  pages/           Route-level pages
```

## Current Routes

- `/` overview page
- `/play` playable pirate sim
- `/world` world rules, enemy roster, and upgrades
- `/roadmap` delivery status and performance targets

## Build Status

Production build passes with:

```bash
npm run build
```

## Notes

- The game logic is currently hosted in a React wrapper around the reused prototype code.
- The `/play` route is lazy-loaded separately from the content routes.
