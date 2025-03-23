# Accessible Bluff Card Game

An online accessible version of the classic Bluff card game designed specifically for visually impaired individuals.

## Features

- **Accessibility-First Design**: Built with screen reader compatibility, keyboard navigation, and audio cues
- **Multiplayer Experience**: Play with friends in real-time using Socket.IO
- **Responsive Interface**: Works on desktop and mobile devices
- **Audio Feedback**: Sound effects for card placement, challenges, and game events

## Accessibility Features

- Complete keyboard navigation support with shortcuts
- ARIA attributes for screen reader compatibility
- Audio cues for important game events
- High contrast mode support
- Speech synthesis for game announcements

## Keyboard Shortcuts

- **J** - Place selected cards
- **F** - Raise (challenge)
- **;** - Pass turn
- **.** - Announce selected cards
- **[** - Select first card in hand
- **]** - Select last card in hand
- **Z** - Announce last game play
- **0** - Announce all cards as sets

## Technology Stack

- **Backend**: Node.js with Express
- **Frontend**: Handlebars templates with Bootstrap
- **Real-time Communication**: Socket.IO
- **Accessibility**: ARIA, Speech Synthesis API

## Setup and Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open your browser and navigate to `http://localhost:3000`

## How to Play

1. Join a game room from the home page
2. Wait for at least one other player to join
3. Cards will be dealt automatically
4. On your turn, select cards and either:
   - Place them face down (with an announced value)
   - Pass your turn
5. After cards are placed, other players can challenge if they think you're bluffing
6. The first player to get rid of all their cards wins

## Playing with AI Bot

The game now includes an AI bot that can play alongside human players. To play with a bot:

1. From the home page, select "Play with Bot" instead of "Join Game Room"
2. Choose a difficulty level:
   - **Beginner (Easy)**: The bot plays with basic strategies, occasionally bluffing, and makes predictable moves
   - **Intermediate (Normal)**: The bot uses more strategic decisions, analyzing previous moves and bluffing more effectively
   - **Advanced (Hard)**: The bot employs complex strategies, adaptive learning, and advanced bluff detection

Bot behavior varies by difficulty:
- All bots can place cards, pass turns, and challenge other players
- Higher difficulty bots are more skilled at recognizing bluffs and make more strategic decisions
- Bots are fully accessible via screen readers and are identified with a robot icon

## Development

This is an MVP version of the game. Future improvements may include:
- User authentication and profiles
- Bot players for solo play
- Statistics tracking
- More customizable accessibility options

## Troubleshooting

If you encounter any issues while playing the game:

1. **Place button not working**: 
   - Make sure it's your turn (your player info will be highlighted)
   - Select at least one card by clicking on it
   - The Place button should highlight when it's enabled

2. **Cards not showing up**:
   - Make sure you have at least 2 players connected (open multiple browser tabs)
   - Wait a few seconds for the game to start

3. **Sound issues**:
   - Make sure your browser allows playing audio
   - Check that sound files are correctly copied to the public/sounds directory

4. **Browser console errors**:
   - Open your browser's developer console (F12) to check for any errors
   - Refresh the page if you see connection errors

## For Developers

To modify the game flow:

1. **server.js**: Contains the game logic and Socket.IO event handling
2. **helpers/game.js**: Contains helper functions for turn management and card distribution
3. **public/js/app.js**: Contains client-side logic and UI updates
4. **public/css/styles.css**: Contains styling including button highlighting # Bluff-Game
