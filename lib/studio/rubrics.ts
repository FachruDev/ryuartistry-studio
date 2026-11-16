import assetImage from "@/rubrics/asset-image.json";
import assetReel from "@/rubrics/asset-reel.json";
import idea from "@/rubrics/idea.json";
import storyboard from "@/rubrics/storyboard.json";
import { LIMITS } from "./config";

export type Rubric = {
  id: string;
  version: string;
  title: string;
  appliesTo: string[];
  instructions: string;
  gates: { id: string; label: string }[];
  criteria: { id: string; label: string; weight: number }[];
};

export const RUBRICS: Record<string, Rubric> = {
  idea,
  storyboard,
  "asset-image": assetImage,
  "asset-reel": assetReel,
};

export function getRubric(id: string): Rubric {
  const rubric = RUBRICS[id];
  if (!rubric) throw new Error(`Unknown rubric "${id}"`);
  return rubric;
}

export type ReviewInput = {
  gates: Record<string, boolean>;
  scores: Record<string, number>;
  feedback: Record<string, string>;
};

export type ScoredReview = {
  finalScore: number;
  passed: boolean;
  failedGates: string[];
};

/**
 * Validates a review against its rubric and computes the weighted score on the server,
 * so a reviewer cannot hand in a final score that does not follow from its own criteria.
 * Throws with every problem listed, so the agent can fix its submission in one go.
 */
export function scoreReview(rubric: Rubric, input: ReviewInput): ScoredReview {
  const problems: string[] = [];

  for (const gate of rubric.gates) {
    if (typeof input.gates[gate.id] !== "boolean") problems.push(`gate "${gate.id}" belum diisi (true/false)`);
  }
  for (const key of Object.keys(input.gates)) {
    if (!rubric.gates.some((g) => g.id === key)) problems.push(`gate "${key}" tidak ada di rubrik`);
  }

  for (const c of rubric.criteria) {
    const s = input.scores[c.id];
    if (!Number.isInteger(s) || s < 1 || s > 10) {
      problems.push(`skor "${c.id}" harus bilangan bulat 1-10`);
    } else if (s < LIMITS.passScore && !input.feedback[c.id]?.trim()) {
      problems.push(`skor "${c.id}" di bawah ${LIMITS.passScore}, feedback untuk kriteria ini wajib diisi`);
    }
  }
  for (const key of Object.keys(input.scores)) {
    if (!rubric.criteria.some((c) => c.id === key)) problems.push(`kriteria "${key}" tidak ada di rubrik`);
  }

  const failedGates = rubric.gates.filter((g) => input.gates[g.id] === false).map((g) => g.id);
  for (const id of failedGates) {
    if (!input.feedback[id]?.trim()) problems.push(`gate "${id}" gagal, jelaskan di feedback["${id}"]`);
  }

  if (!Object.values(input.feedback).some((f) => f.trim())) {
    problems.push("minimal satu saran peningkatan wajib diisi, walau lolos");
  }

  if (problems.length) throw new Error(`Review tidak valid:\n- ${problems.join("\n- ")}`);

  const totalWeight = rubric.criteria.reduce((sum, c) => sum + c.weight, 0);
  const weighted = rubric.criteria.reduce((sum, c) => sum + c.weight * input.scores[c.id], 0);
  const finalScore = Math.round((weighted / totalWeight) * 100) / 100;

  return {
    finalScore,
    passed: failedGates.length === 0 && finalScore >= LIMITS.passScore,
    failedGates,
  };
}
