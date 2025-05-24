const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('public'));

// Game configuration
const CONFIG = {
  MAX_SECURITY: 10,
  MIN_SECURITY: 0,
  INITIAL_RESOURCES: 15,
  TURN_RESOURCES: {
    attacker: 2,
    defender: 3
  }
};

// Defense options
const defenseOptions = [
  { id: 1, type: 'Firewall', cost: 3, security_boost: 1.5 },
  { id: 2, type: 'IDS', cost: 4, security_boost: 2.0 },
  { id: 3, type: 'Patch', cost: 2, security_boost: 0.8 }
];

// Attack patterns
const attackPatterns = [
  { id: 1, name: 'Phishing', success_rate: 0.7, cost: 2 },
  { id: 2, name: 'DDoS', success_rate: 0.6, cost: 3 },
  { id: 3, name: 'Zero-Day', success_rate: 0.85, cost: 4 }
];

// Game state
let gameState = {
  turn: 0,
  attacker: { resources: CONFIG.INITIAL_RESOURCES, lastMove: null, attacks: [] },
  defender: { resources: CONFIG.INITIAL_RESOURCES, lastMove: null, defenses: [] },
  network: { security_level: 5 },
  gameOver: false,
  winner: null,
  currentPlayer: 'attacker' // Tracks whose turn it is
};

class MinimaxAI {
  constructor(depth = 3) {
    this.depth = depth;
  }

  evaluate(state) {
    if (state.gameOver) {
      return state.winner === 'defender' ? 1000 : -1000;
    }

    // Security score (0-50 points)
    const securityScore = (state.network.security_level / CONFIG.MAX_SECURITY) * 50;
    
    // Resource score (0-30 points)
    const resourceScore = Math.min(30, 
      (state.defender.resources - state.attacker.resources) * 1.5
    );
    
    // Defense advantage (0-20 points)
    const defenseScore = Math.min(20, state.defender.defenses.length * 2);
    
    return securityScore + resourceScore + defenseScore;
  }

  getBestMove(state) {
    let bestScore = -Infinity;
    let bestMove = defenseOptions[0];

    for (const defense of defenseOptions) {
      if (state.defender.resources >= defense.cost) {
        const newState = this.simulateMove(JSON.parse(JSON.stringify(state)), defense);
        const score = this.minimax(newState, this.depth - 1, false);
        
        if (score > bestScore) {
          bestScore = score;
          bestMove = defense;
        }
      }
    }
    return bestMove;
  }

  minimax(state, depth, isMaximizing) {
    if (depth === 0 || state.gameOver) {
      return this.evaluate(state);
    }

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (const defense of defenseOptions) {
        if (state.defender.resources >= defense.cost) {
          const newState = this.simulateMove(JSON.parse(JSON.stringify(state)), defense);
          const evaluation = this.minimax(newState, depth - 1, false);
          maxEval = Math.max(maxEval, evaluation);
        }
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const attack of attackPatterns) {
        if (state.attacker.resources >= attack.cost) {
          const newState = this.simulateMove(JSON.parse(JSON.stringify(state)), attack);
          const evaluation = this.minimax(newState, depth - 1, true);
          minEval = Math.min(minEval, evaluation);
        }
      }
      return minEval;
    }
  }

  simulateMove(state, move) {
    if (move.type) { // Defense move
      state.defender.resources -= move.cost;
      state.network.security_level = Math.min(
        CONFIG.MAX_SECURITY,
        state.network.security_level + move.security_boost
      );
      state.defender.lastMove = move;
      state.defender.defenses.push(move);
      state.currentPlayer = 'attacker';
    } else { // Attack move
      state.attacker.resources -= move.cost;
      state.network.security_level = Math.max(
        CONFIG.MIN_SECURITY,
        state.network.security_level - (move.success_rate * 2)
      );
      state.attacker.lastMove = move;
      state.attacker.attacks.push(move);
      state.currentPlayer = 'defender';
    }
    
    this.checkGameEnd(state);
    return state;
  }

  checkGameEnd(state) {
    state.turn++;
    
    // Add turn resources
    if (state.currentPlayer === 'defender') {
      state.attacker.resources += CONFIG.TURN_RESOURCES.attacker;
    } else {
      state.defender.resources += CONFIG.TURN_RESOURCES.defender;
    }
    
    // Security decay
    state.network.security_level = Math.max(
      CONFIG.MIN_SECURITY,
      state.network.security_level - 0.3
    );
    
    // Check win conditions
    if (state.network.security_level <= CONFIG.MIN_SECURITY) {
      state.gameOver = true;
      state.winner = 'attacker';
    } else if (state.network.security_level >= CONFIG.MAX_SECURITY) {
      state.gameOver = true;
      state.winner = 'defender';
    } else if (state.attacker.resources <= 0 && state.defender.resources <= 0) {
      state.gameOver = true;
      state.winner = state.network.security_level >= 5 ? 'defender' : 'attacker';
    }
  }
}

const ai = new MinimaxAI(3);

// API Endpoints
app.get('/init', (req, res) => {
  gameState = {
    turn: 0,
    attacker: { resources: CONFIG.INITIAL_RESOURCES, lastMove: null, attacks: [] },
    defender: { resources: CONFIG.INITIAL_RESOURCES, lastMove: null, defenses: [] },
    network: { security_level: 5 },
    gameOver: false,
    winner: null,
    currentPlayer: 'attacker'
  };
  res.json({ 
    gameState, 
    attacks: attackPatterns, 
    defenses: defenseOptions,
    config: {
      MAX_SECURITY: CONFIG.MAX_SECURITY,
      MIN_SECURITY: CONFIG.MIN_SECURITY
    }
  });
});

app.post('/attack', (req, res) => {
  if (gameState.gameOver) {
    return res.status(400).json({ error: "Game has ended" });
  }
  if (gameState.currentPlayer !== 'attacker') {
    return res.status(400).json({ error: "Not your turn" });
  }

  const { attackId } = req.body;
  const attack = attackPatterns.find(a => a.id === attackId);
  
  if (!attack) {
    return res.status(400).json({ error: "Invalid attack" });
  }
  if (gameState.attacker.resources < attack.cost) {
    return res.status(400).json({ error: "Not enough resources" });
  }

  gameState.attacker.resources -= attack.cost;
  gameState.network.security_level = Math.max(
    CONFIG.MIN_SECURITY,
    gameState.network.security_level - (attack.success_rate * 2)
  );
  gameState.attacker.lastMove = attack;
  gameState.attacker.attacks.push(attack);
  gameState.currentPlayer = 'defender';

  // Process turn
  gameState.turn++;
  gameState.attacker.resources += CONFIG.TURN_RESOURCES.attacker;
  gameState.network.security_level = Math.max(
    CONFIG.MIN_SECURITY,
    gameState.network.security_level - 0.3
  );

  checkGameEnd();
  res.json({ gameState });
});

app.post('/defend', (req, res) => {
  if (gameState.gameOver) {
    return res.status(400).json({ error: "Game has ended" });
  }
  if (gameState.currentPlayer !== 'defender') {
    return res.status(400).json({ error: "Not your turn" });
  }

  const defense = ai.getBestMove(gameState);
  
  if (!defense || gameState.defender.resources < defense.cost) {
    return res.status(400).json({ error: "Cannot defend" });
  }

  gameState.defender.resources -= defense.cost;
  gameState.network.security_level = Math.min(
    CONFIG.MAX_SECURITY,
    gameState.network.security_level + defense.security_boost
  );
  gameState.defender.lastMove = defense;
  gameState.defender.defenses.push(defense);
  gameState.currentPlayer = 'attacker';

  // Process turn
  gameState.turn++;
  gameState.defender.resources += CONFIG.TURN_RESOURCES.defender;
  gameState.network.security_level = Math.max(
    CONFIG.MIN_SECURITY,
    gameState.network.security_level - 0.3
  );

  checkGameEnd();
  res.json({ gameState, defense });
});

function checkGameEnd() {
  if (gameState.network.security_level <= CONFIG.MIN_SECURITY) {
    gameState.gameOver = true;
    gameState.winner = 'attacker';
  } else if (gameState.network.security_level >= CONFIG.MAX_SECURITY) {
    gameState.gameOver = true;
    gameState.winner = 'defender';
  } else if (gameState.attacker.resources <= 0 && gameState.defender.resources <= 0) {
    gameState.gameOver = true;
    gameState.winner = gameState.network.security_level >= 5 ? 'defender' : 'attacker';
  }
}

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});