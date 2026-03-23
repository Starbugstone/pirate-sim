// @ts-nocheck
import { forwardRef } from 'react'

export const GameHUD = forwardRef(function GameHUD({ ui, actions }, ref) {
  const { containerRef, canvasRef, windOverlayRef } = ref

  return (
    <div className="game-container" ref={containerRef}>
      <div className="hud">
        <div className="hud-left">
          <div className="stat">HP: {ui.hp}/{100 + ui.playerUpgrades.maxHpBonus * 10}</div>
          <div className="stat">Gold: {ui.gold}</div>
          <div className="stat">Wind: {ui.windDirection} {ui.windSpeed.toFixed(1)} kn</div>
          <div className="stat">Speed: {ui.playerSpeed?.toFixed(1) || '0'} kn{ui.brakeActive ? ' | BRAKE' : ''}</div>
        </div>
        <div className="hud-center">
          {ui.message ? <div className="message">{ui.message}</div> : null}
        </div>
        <div className="hud-right">
          <div className="stat">Port: {ui.portCooldown > 0 ? `${ui.portCooldown.toFixed(1)}s` : 'READY'}</div>
          <div className="stat">Stbd: {ui.starboardCooldown > 0 ? `${ui.starboardCooldown.toFixed(1)}s` : 'READY'}</div>
          <div className="stat">Enemies: {ui.aliveEnemies} / 3 | Kraken: {ui.krakenHp > 0 ? 'ACTIVE' : (ui.aliveEnemies === 0 ? 'NEXT' : '---')}</div>
        </div>
      </div>
      <canvas ref={canvasRef}></canvas>
      <canvas ref={windOverlayRef} className="wind-overlay-canvas"></canvas>
      <div className="indicators">
        {ui.enemyIndicators.map((enemy, index) => (
          <div
            key={`${enemy.label}-${index}`}
            className="indicator"
            style={{
              left: `${enemy.x}%`,
              top: `${enemy.y}%`,
              transform: `translate(-50%, -50%) rotate(${enemy.angle}rad)`
            }}
          >
            <span className="indicator-icon">{enemy.icon}</span>
            <span className="indicator-label">{enemy.label}</span>
            <div className="health-bar-container">
              <div className="health-bar" style={{ width: `${enemy.hpPercent * 100}%` }}></div>
            </div>
          </div>
        ))}
      </div>
      <div className="controls">
        <div className="control-hint">Click to lock | Move mouse to steer | LMB=Starboard | RMB=Port | Hold B = Brake | Scroll = Camera | Avoid rocks</div>
      </div>
      {ui.gameState === 'start' ? (
        <div className="overlay">
          <div className="title">Pirates of the Burning Sea</div>
          <p>Navigate the Caribbean. Fight the navy. Survive the Kraken.</p>
          <div className="instructions">
            <p><strong>Mouse</strong> - Steer your ship</p>
            <p><strong>Left Click</strong> - Fire starboard cannons</p>
            <p><strong>Right Click</strong> - Fire port cannons</p>
            <p><strong>Hold B</strong> - Apply braking force without dropping anchor</p>
            <p><strong>Wind</strong> - Sail with the wind for speed, against it for control</p>
            <p><strong>Avoid</strong> - Islands, rocks, and the Kraken</p>
            <p><strong>Defeat</strong> - The enemy ship, then face the Kraken</p>
          </div>
          <button onClick={() => actions.startGame()}>Set Sail</button>
        </div>
      ) : null}
      {ui.gameState === 'gameover' ? (
        <div className="overlay">
          <div className="title">{ui.victory ? 'VICTORY' : 'GAME OVER'}</div>
          <p>{ui.victory ? 'You defeated the enemy and survived the Kraken.' : 'Your ship rests at the bottom of the sea.'}</p>
          <p>Gold collected: {ui.gold}</p>
          <button onClick={() => actions.startGame()}>Sail Again</button>
        </div>
      ) : null}
      {ui.shopOpen ? (
        <div className="overlay harbour-overlay">
          <div className="harbour-title">PORT SHOP</div>
          <div className="harbour-gold">{ui.gold} Gold</div>
          <div className="harbour-hp">HP: {ui.hp}/{100 + ui.playerUpgrades.maxHpBonus * 10}</div>
          <div className="shop-upgrades">
            <UpgradeCard icon="S" name="Faster Sails" level={ui.playerUpgrades.sailSpeed} maxLevel={3}
              bonus={ui.playerUpgrades.sailSpeed === 0 ? '+0 max speed' : `+${ui.playerUpgrades.sailSpeed * 3} max speed`}
              costs={[150, 350, 600]} onBuy={() => actions.buyUpgrade('sailSpeed')} />
            <UpgradeCard icon="C" name="Broadside Power" level={ui.playerUpgrades.cannonCount} maxLevel={3}
              bonus={ui.playerUpgrades.cannonCount === 0 ? '3 cannons/side' : `${3 + ui.playerUpgrades.cannonCount * 2} cannons/side`}
              costs={[200, 450, 750]} onBuy={() => actions.buyUpgrade('cannonCount')} />
            <UpgradeCard icon="R" name="Faster Cannons" level={ui.playerUpgrades.cannonSpeed} maxLevel={3}
              bonus={ui.playerUpgrades.cannonSpeed === 0 ? '1.5s cooldown' : `${(1.5 - ui.playerUpgrades.cannonSpeed * 0.25).toFixed(2)}s cooldown`}
              costs={[175, 400, 700]} onBuy={() => actions.buyUpgrade('cannonSpeed')} />
            <div className="upgrade-card repair-card">
              <div className="upgrade-icon">H</div>
              <div className="upgrade-name">Repair Haul</div>
              <div className="upgrade-level">Infinite</div>
              <div className="upgrade-bonus">Restore 10 HP for {100 + ui.playerUpgrades.repairCount * 10}g</div>
              <button className="upgrade-btn repair-btn" onClick={() => actions.buyUpgrade('repairHaul')}>
                BUY {100 + ui.playerUpgrades.repairCount * 10}g
              </button>
            </div>
            <UpgradeCard icon="HP" name="Max HP" level={ui.playerUpgrades.maxHpBonus} maxLevel={5}
              bonus={`Current max: ${100 + ui.playerUpgrades.maxHpBonus * 10} HP`}
              levelLabel={`+${ui.playerUpgrades.maxHpBonus * 10} / +10 per level`}
              costs={[150, 300, 500, 750, 1000]} maxedLabel="MAXED (150 HP)"
              onBuy={() => actions.buyUpgrade('maxHpBonus')} />
          </div>
          {ui.shopMessage ? <div className="shop-message">{ui.shopMessage}</div> : null}
          <button className="leave-btn" onClick={() => actions.closeShop()}>Leave Port</button>
          <div className="shop-hint">Press A to raise anchor and sail</div>
        </div>
      ) : null}
    </div>
  )
})

function UpgradeCard({ icon, name, level, maxLevel, bonus, costs, onBuy, levelLabel, maxedLabel }) {
  return (
    <div className="upgrade-card">
      <div className="upgrade-icon">{icon}</div>
      <div className="upgrade-name">{name}</div>
      <div className="upgrade-level">{levelLabel || `Level ${level}/${maxLevel}`}</div>
      <div className="upgrade-bonus">{bonus}</div>
      {level < maxLevel ? (
        <button className="upgrade-btn" onClick={onBuy}>BUY {costs[level]}g</button>
      ) : (
        <div className="upgrade-max">{maxedLabel || 'MAXED'}</div>
      )}
    </div>
  )
}
