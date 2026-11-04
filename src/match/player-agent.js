export class PlayerAgent {
  constructor({ playerId, teamId, lineupPosition, formalPosition }) {
    this.playerId = playerId;
    this.teamId = teamId;
    this.lineupPosition = lineupPosition;
    this.formalPosition = formalPosition;
    this.currentBehavior = "IDLE";
    this.receivedEventCount = 0;
  }

  receivePresentationCommand(event, command) {
    if (!event?.type) throw new TypeError("Player Agent 需要正式事件才能更新表現狀態。");
    if (command?.playerId !== this.playerId) return null;
    this.receivedEventCount += 1;
    this.currentBehavior = command.behavior ?? "IDLE";
    return Object.freeze({ eventType: event.type, ...command });
  }

  getState() {
    return Object.freeze({
      playerId: this.playerId,
      teamId: this.teamId,
      formalPosition: this.formalPosition,
      rotationPosition: this.lineupPosition,
      currentBehavior: this.currentBehavior,
      receivedEventCount: this.receivedEventCount,
    });
  }
}

export function createPlayerAgentSystem(match) {
  const agents = [];
  for (const teamId of ["HOME", "AWAY"]) {
    for (const worldPlayer of match.scene.players[teamId]) {
      const player = match.teams[teamId].players
        .find((candidate) => candidate.id === worldPlayer.playerId);
      if (!player) throw new Error(`無法建立場上球員 ${worldPlayer.playerId} 的 Player Agent。`);
      agents.push(new PlayerAgent({
        playerId: player.id,
        teamId,
        lineupPosition: worldPlayer.lineupPosition,
        formalPosition: player.position,
      }));
    }
  }
  if (agents.length !== 12) throw new Error("正式比賽必須建立十二個 Player Agent。");
  return Object.freeze({
    agents: Object.freeze(agents),
    applyPresentationCommands(event, commands) {
      return Object.freeze(commands.map((command) => {
        const agent = agents.find((candidate) => candidate.playerId === command.playerId);
        if (!agent) throw new Error(`找不到表現命令對應的 Player Agent：${command.playerId}`);
        return agent.receivePresentationCommand(event, command);
      }));
    },
    getAgentStates() {
      return Object.freeze(agents.map((agent) => agent.getState()));
    },
  });
}
