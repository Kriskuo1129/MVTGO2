export const PLAYER_POSITION_AVATAR_COLORS = Object.freeze({
  S: "#C87979",
  OH: "#7199CA",
  MB: "#78A88A",
  OP: "#D8B665",
});

export function getPlayerAvatarPresentation(player) {
  if (!player) return Object.freeze({ photoUrl: null, label: "選擇", color: "#333333" });
  const name = typeof player.name === "string" ? player.name.trim() : "";
  return Object.freeze({
    photoUrl: typeof player.avatar === "string" && player.avatar ? player.avatar : null,
    label: name ? name.slice(-2) : "球員",
    color: PLAYER_POSITION_AVATAR_COLORS[player.position] ?? "#777777",
  });
}

export function createPlayerAvatarElement(player, className = "player-avatar") {
  const presentation = getPlayerAvatarPresentation(player);
  const avatar = document.createElement("span");
  avatar.className = className;
  avatar.classList.add("unified-player-avatar");
  avatar.style.backgroundColor = presentation.color;
  if (presentation.photoUrl) {
    const image = document.createElement("img");
    image.src = presentation.photoUrl;
    image.alt = `${player.name}頭像`;
    avatar.append(image);
  } else {
    avatar.textContent = presentation.label;
    avatar.setAttribute("aria-label", `${player?.name ?? "球員"}預設頭像`);
  }
  return avatar;
}

export function updatePlayerAvatarElement({ avatar, fallback, image }, player) {
  const presentation = getPlayerAvatarPresentation(player);
  avatar.style.backgroundColor = presentation.color;
  avatar.classList.add("unified-player-avatar");
  fallback.textContent = presentation.label;
  fallback.hidden = Boolean(presentation.photoUrl);
  if (presentation.photoUrl) {
    if (image.getAttribute("src") !== presentation.photoUrl) image.src = presentation.photoUrl;
    image.hidden = false;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
  }
  return presentation;
}
