const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Load enhanced datasets from data directory
const vulnerabilities = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'vulnerabilities.json')));
const attackPatterns = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'attack_patterns.json')));
const defenseOptions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'defense_options.json')));

// Game configuration
const CONFIG = {
    MAX_SECURITY: 100,
    MIN_SECURITY: 0,
    INITIAL_RESOURCES: 100,
    TURN_RESOURCES: {
        attacker: 10,
        defender: 15
    },
    SECURITY_DECAY_RATE: 1
};

// Game state
let gameState = {
    turn: 0,
    attacker: { resources: CONFIG.INITIAL_RESOURCES, lastMove: null, attacks: [] },
    defender: { resources: CONFIG.INITIAL_RESOURCES, lastMove: null, defenses: [] },
    network: { security_level: 50 },
    gameOver: false,
    winner: null,
    currentPlayer: 'attacker'
};

class EnhancedMinimaxAI {
    constructor(depth = 4) {
        this.depth = depth;
        this.defenseHistory = [];
    }

    evaluate(state) {
        if (state.gameOver) {
            return state.winner === 'defender' ? Infinity : -Infinity;
        }

        // Base security score (0-60 points)
        let score = (state.network.security_level / CONFIG.MAX_SECURITY) * 60;
        
        // Resource difference (0-20 points)
        score += Math.min(20, (state.defender.resources - state.attacker.resources) / 5);
        
        // Defense effectiveness based on attack history (0-20 points)
        const lastAttack = state.attacker.lastMove;
        if (lastAttack) {
            const defenseEffectiveness = this.calculateDefenseEffectiveness(lastAttack);
            score += defenseEffectiveness * 20;
        }
        
        // Penalize repeating same defenses
        const lastDefenses = state.defender.defenses.slice(-3);
        if (lastDefenses.length >= 3 && new Set(lastDefenses.map(d => d.id)).size === 1) {
            score -= 15;
        }
        
        return score;
    }

    calculateDefenseEffectiveness(attack) {
        // Get all defenses that counter this attack type
        const effectiveDefenses = defenseOptions.filter(defense => 
            defense.effective_against.includes(attack.type));
        
        if (effectiveDefenses.length === 0) return 0;
        
        // Return average effectiveness
        return effectiveDefenses.reduce((sum, defense) => 
            sum + defense.effectiveness, 0) / effectiveDefenses.length;
    }

    getBestMove(state) {
        let bestScore = -Infinity;
        let bestMove = null;
        const availableDefenses = defenseOptions.filter(d => 
            state.defender.resources >= d.cost);

        // If no defenses available, return null
        if (availableDefenses.length === 0) return null;

        // Consider last attack for counter measures
        const lastAttack = state.attacker.lastMove;
        
        for (const defense of availableDefenses) {
            // Simulate the move
            const newState = this.simulateMove(JSON.parse(JSON.stringify(state)), defense);
            
            // Evaluate with minimax
            let score = this.minimax(newState, this.depth - 1, false);
            
            // Bonus for defenses that counter last attack
            if (lastAttack && defense.effective_against.includes(lastAttack.type)) {
                score += 10 * defense.effectiveness;
            }
            
            // Penalty for recently used defenses
            const recentUses = this.defenseHistory.filter(id => id === defense.id).length;
            score -= recentUses * 5;
            
            if (score > bestScore || (score === bestScore && defense.cost < bestMove?.cost)) {
                bestScore = score;
                bestMove = defense;
            }
        }
        
        if (bestMove) {
            this.defenseHistory.push(bestMove.id);
            if (this.defenseHistory.length > 5) this.defenseHistory.shift();
        }
        
        return bestMove;
    }

    minimax(state, depth, isMaximizing) {
        if (depth === 0 || state.gameOver) {
            return this.evaluate(state);
        }

        if (isMaximizing) {
            let maxEval = -Infinity;
            const availableDefenses = defenseOptions.filter(d => 
                state.defender.resources >= d.cost);
            
            if (availableDefenses.length === 0) {
                return this.evaluate(state);
            }

            for (const defense of availableDefenses) {
                const newState = this.simulateMove(JSON.parse(JSON.stringify(state)), defense);
                const evaluation = this.minimax(newState, depth - 1, false);
                maxEval = Math.max(maxEval, evaluation);
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            const availableAttacks = attackPatterns.filter(a => 
                state.attacker.resources >= a.cost);
            
            if (availableAttacks.length === 0) {
                return this.evaluate(state);
            }

            for (const attack of availableAttacks) {
                const newState = this.simulateMove(JSON.parse(JSON.stringify(state)), attack);
                const evaluation = this.minimax(newState, depth - 1, true);
                minEval = Math.min(minEval, evaluation);
            }
            return minEval;
        }
    }

    simulateMove(state, move) {
        if (move.type === 'defense') {
            state.defender.resources -= move.cost;
            state.network.security_level = Math.min(
                CONFIG.MAX_SECURITY,
                state.network.security_level + (move.security_boost * (1 + Math.random() * 0.2))
            );
            state.defender.lastMove = move;
            state.defender.defenses.push(move);
            state.currentPlayer = 'attacker';
        } else {
            state.attacker.resources -= move.cost;
            const effectiveness = move.effectiveness * (0.9 + Math.random() * 0.2);
            state.network.security_level = Math.max(
                CONFIG.MIN_SECURITY,
                state.network.security_level - (move.damage * effectiveness)
            );
            state.attacker.lastMove = move;
            state.attacker.attacks.push(move);
            state.currentPlayer = 'defender';
        }
        
        this.processTurn(state);
        return state;
    }

    processTurn(state) {
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
            state.network.security_level - CONFIG.SECURITY_DECAY_RATE
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
            state.winner = state.network.security_level >= 50 ? 'defender' : 'attacker';
        }
    }
}

const ai = new EnhancedMinimaxAI(4);

function checkGameEnd() {
    if (gameState.network.security_level <= CONFIG.MIN_SECURITY) {
        gameState.gameOver = true;
        gameState.winner = 'attacker';
    } else if (gameState.network.security_level >= CONFIG.MAX_SECURITY) {
        gameState.gameOver = true;
        gameState.winner = 'defender';
    } else if (gameState.attacker.resources <= 0 && gameState.defender.resources <= 0) {
        gameState.gameOver = true;
        gameState.winner = gameState.network.security_level >= 50 ? 'defender' : 'attacker';
    }
}

// API Endpoints
app.get('/init', (req, res) => {
    gameState = {
        turn: 0,
        attacker: { resources: CONFIG.INITIAL_RESOURCES, lastMove: null, attacks: [] },
        defender: { resources: CONFIG.INITIAL_RESOURCES, lastMove: null, defenses: [] },
        network: { security_level: 50 },
        gameOver: false,
        winner: null,
        currentPlayer: 'attacker'
    };
    res.json({ 
        gameState, 
        attacks: attackPatterns, 
        defenses: defenseOptions,
        config: CONFIG
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

    // Apply attack with some randomness
    gameState.attacker.resources -= attack.cost;
    const effectiveness = attack.effectiveness * (0.8 + Math.random() * 0.4);
    gameState.network.security_level = Math.max(
        CONFIG.MIN_SECURITY,
        gameState.network.security_level - (attack.damage * effectiveness)
    );
    gameState.attacker.lastMove = attack;
    gameState.attacker.attacks.push(attack);
    gameState.currentPlayer = 'defender';

    // Process turn
    gameState.turn++;
    gameState.attacker.resources += CONFIG.TURN_RESOURCES.attacker;
    gameState.network.security_level = Math.max(
        CONFIG.MIN_SECURITY,
        gameState.network.security_level - CONFIG.SECURITY_DECAY_RATE
    );

    checkGameEnd();
    res.json({ gameState });
});

// ... (previous code remains the same until /defend endpoint)

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

    // Apply defense with some randomness
    gameState.defender.resources -= defense.cost;
    const effectiveness = defense.effectiveness * (0.9 + Math.random() * 0.2);
    const actualBoost = defense.security_boost * effectiveness;
    gameState.network.security_level = Math.min(
        CONFIG.MAX_SECURITY,
        gameState.network.security_level + actualBoost
    );
    gameState.defender.lastMove = defense;
    gameState.defender.defenses.push(defense);
    gameState.currentPlayer = 'attacker';

    // Process turn
    gameState.turn++;
    gameState.defender.resources += CONFIG.TURN_RESOURCES.defender;
    gameState.network.security_level = Math.max(
        CONFIG.MIN_SECURITY,
        gameState.network.security_level - CONFIG.SECURITY_DECAY_RATE
    );

    checkGameEnd();
    
    // Enhanced defense response
    res.json({ 
        gameState,
        defense: {
            name: defense.name,
            type: defense.type,
            boost: actualBoost.toFixed(1),
            effectiveness: effectiveness.toFixed(2),
            cost: defense.cost,
            message: `Defended with ${defense.name} (${defense.type}), boosting security by ${actualBoost.toFixed(1)} points`
        }
    });
});

// ... (rest of the code remains the same)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});