import layout from './pedestrian-layout.json' with { type: 'json' };

export const seatingLayout = layout;
const rig = layout.person;
export const seatedHipHeight = layout.benches.seatHeight + rig.pelvisHeight;
const seatedKneeHeight = rig.ankleHeight + rig.shinLength;
export const seatStandZ = layout.benches.hipZ + Math.sqrt(rig.thighLength ** 2 - (seatedHipHeight - seatedKneeHeight) ** 2);
export const smoothSeat = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
const safeAcos = (v: number) => Math.acos(Math.max(-1, Math.min(1, v)));

/** Both ankles stay fixed on the paving while the hip moves onto the seat. */
export function seatedPose(blend: number) {
  const rootY = (seatedHipHeight - rig.standingHipHeight) * blend;
  const rootZ = seatStandZ + (layout.benches.hipZ - seatStandZ) * blend;
  const down = rig.standingHipHeight + rootY - rig.ankleHeight;
  const forward = seatStandZ - rootZ;
  const reach = Math.hypot(down, forward);
  const hip = -(Math.atan2(forward, down) + safeAcos((rig.thighLength ** 2 + reach ** 2 - rig.shinLength ** 2) / (2 * rig.thighLength * reach)));
  const knee = Math.PI - safeAcos((rig.thighLength ** 2 + rig.shinLength ** 2 - reach ** 2) / (2 * rig.thighLength * rig.shinLength));
  return { rootY, rootZ, hip, knee, ankle: -hip - knee, arm: -.75 * blend };
}
