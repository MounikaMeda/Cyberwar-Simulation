document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const defendBtn = document.getElementById('defend-btn');
  const statusDiv = document.getElementById('status');
  const securityBar = document.getElementById('security-bar');
  const gameLog = document.getElementById('game-log');
  const attackButtons = document.getElementById('attack-buttons');
  const attackerResourcesDiv = document.getElementById('attacker-resources');
  const defenderResourcesDiv = document.getElementById('defender-resources');
  const turnIndicator = document.getElementById('turn-indicator');
  const restartBtn = document.getElementById('restart-btn');

  // Game state
  let gameState;
  let attackPatterns = [];
  let defenseOptions = [];
  let config;

  // Initialize game
  async function initGame() {
    try {
      const response = await fetch('/init');
      const data = await response.json();
      gameState = data.gameState;
      attackPatterns = data.attacks;
      defenseOptions = data.defenses;
      config = data.config;
      
      renderAttackButtons();
      updateUI();
      addLog('Game started!');
    } catch (error) {
      console.error('Initialization error:', error);
      addLog('Failed to initialize game', true);
    }
  }

  // Render attack buttons
  function renderAttackButtons() {
    attackButtons.innerHTML = '';
    attackPatterns.forEach(attack => {
      const btn = document.createElement('button');
      btn.className = 'attack-button';
      btn.dataset.id = attack.id;
      btn.innerHTML = `
        <strong>${attack.name}</strong><br>
        <small>Cost: ${attack.cost} | Power: ${Math.round(attack.success_rate * 100)}%</small>
      `;
      btn.addEventListener('click', () => sendAttack(attack.id));
      attackButtons.appendChild(btn);
    });
  }

  // Send attack to server
  async function sendAttack(attackId) {
    try {
      const response = await fetch('/attack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attackId })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
      }
      
      const data = await response.json();
      gameState = data.gameState;
      addLog(`Attacked with ${gameState.attacker.lastMove.name}`);
      updateUI();
      
      if (gameState.gameOver) {
        endGame();
      } else if (gameState.currentPlayer === 'defender') {
        setTimeout(autoDefend, 1500);
      }
    } catch (error) {
      addLog(error.message, true);
    }
  }

  // Auto-defend when it's defender's turn
  // ... (previous code remains the same until the autoDefend function)

async function autoDefend() {
    try {
        const response = await fetch('/defend', {
            method: 'POST'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error);
        }
        
        const data = await response.json();
        gameState = data.gameState;
        
        // Display detailed defense information
        const defense = data.defense;
        addLog(defense.message);
        addLog(`Defense effectiveness: ${(defense.effectiveness * 100).toFixed(0)}% | Cost: ${defense.cost} resources`);
        
        updateUI();
        
        if (gameState.gameOver) {
            endGame();
        }
    } catch (error) {
        addLog(error.message, true);
    }
}

// ... (rest of the code remains the same)

  // Update UI
  function updateUI() {
    // Update resources
    attackerResourcesDiv.innerHTML = `
      <h3>Attacker Resources: ${gameState.attacker.resources}</h3>
      ${gameState.attacker.lastMove ? 
        `<p>Last move: ${gameState.attacker.lastMove.name}</p>` : ''}
    `;
    
    defenderResourcesDiv.innerHTML = `
      <h3>Defender Resources: ${gameState.defender.resources}</h3>
      ${gameState.defender.lastMove ? 
        `<p>Last move: ${gameState.defender.lastMove.type}</p>` : ''}
    `;

    // Update security level
    const securityPercent = (gameState.network.security_level / config.MAX_SECURITY) * 100;
    securityBar.style.width = `${securityPercent}%`;
    securityBar.style.backgroundColor = 
      securityPercent > 70 ? '#64ffda' : 
      securityPercent > 30 ? '#ffd700' : '#ff5555';
    
    // Update status
    statusDiv.innerHTML = `
      <h2>Turn: ${gameState.turn}</h2>
      <p>Security Level: ${gameState.network.security_level.toFixed(1)}/${config.MAX_SECURITY}</p>
    `;

    // Update turn indicator
    turnIndicator.textContent = `Current Turn: ${gameState.currentPlayer === 'attacker' ? 'Attacker' : 'Defender'}`;
    turnIndicator.className = gameState.currentPlayer === 'attacker' ? 'attacker-turn' : 'defender-turn';

    // Update button states
    updateButtonStates();
  }

  // Update button enabled/disabled states
  function updateButtonStates() {
    // Attack buttons
    const attackBtns = attackButtons.querySelectorAll('button');
    attackBtns.forEach(btn => {
      const attackId = parseInt(btn.dataset.id);
      const attack = attackPatterns.find(a => a.id === attackId);
      btn.disabled = gameState.gameOver || 
                    gameState.currentPlayer !== 'attacker' ||
                    gameState.attacker.resources < attack.cost;
    });

    // Defend button
    defendBtn.disabled = gameState.gameOver || 
                        gameState.currentPlayer !== 'defender' ||
                        gameState.defender.resources < Math.min(...defenseOptions.map(d => d.cost));
  }

  // Add message to log
  function addLog(message, isError = false) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${isError ? 'error' : ''}`;
    entry.textContent = `[Turn ${gameState.turn}] ${message}`;
    gameLog.prepend(entry);
  }

  // Handle game end
  function endGame() {
    let message = '';
    if (gameState.winner === 'attacker') {
      message = `Game Over! Attacker won by compromising the network!`;
    } else {
      message = `Game Over! Defender successfully protected the network!`;
    }
    
    addLog(message);
    
    // Disable all buttons
    const buttons = attackButtons.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    defendBtn.disabled = true;
    
    // Show game over message
    const gameOverDiv = document.createElement('div');
    gameOverDiv.className = `game-over ${gameState.winner}`;
    gameOverDiv.textContent = message;
    statusDiv.appendChild(gameOverDiv);
  }

  // Event listeners
  defendBtn.addEventListener('click', autoDefend);
  restartBtn.addEventListener('click', initGame);

  // Start the game
  initGame();
});