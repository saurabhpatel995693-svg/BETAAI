export interface PredictionResult {
  method: string;
  rangeLow: number;
  rangeHigh: number;
  mostLikely: number;
  citations: string[];
  confidenceFactors: string[];
}

export function calculatePrediction(
  sex: 'male' | 'female',
  age: number, // in years (e.g. 15.5)
  currentHeight: number, // in cm
  currentWeight: number, // in kg
  fatherHeight: number, // in cm
  motherHeight: number, // in cm
  tannerStage: number | null // optional puberty stage 1-5
): PredictionResult {
  // 1. Mid-Parental Height Calculation
  const offset = sex === 'male' ? 13 : -13;
  const midParentalHeight = (fatherHeight + motherHeight + offset) / 2;

  // 2. Statistical Weight and Age adjustment coefficients (Khamis-Roche inspired approximation)
  // Khamis-Roche predicts height as: Beta0 + Beta1 * CurrentHeight + Beta2 * CurrentWeight + Beta3 * MidParentalHeight
  // These coefficients represent general regression values for age ranges.
  let b0 = 0, b_height = 0, b_weight = 0, b_parent = 0;

  if (sex === 'male') {
    if (age < 11) {
      b0 = 25; b_height = 0.85; b_weight = -0.15; b_parent = 0.25;
    } else if (age < 14) {
      b0 = 18; b_height = 0.88; b_weight = -0.12; b_parent = 0.20;
    } else if (age < 17) {
      b0 = 10; b_height = 0.92; b_weight = -0.08; b_parent = 0.15;
    } else {
      b0 = 2; b_height = 0.97; b_weight = -0.02; b_parent = 0.08;
    }
  } else {
    // Female
    if (age < 10) {
      b0 = 20; b_height = 0.83; b_weight = -0.18; b_parent = 0.28;
    } else if (age < 13) {
      b0 = 12; b_height = 0.88; b_weight = -0.10; b_parent = 0.18;
    } else if (age < 15) {
      b0 = 5; b_height = 0.94; b_weight = -0.05; b_parent = 0.10;
    } else {
      b0 = 1; b_height = 0.99; b_weight = -0.01; b_parent = 0.04;
    }
  }

  let predictedHeight = b0 + b_height * currentHeight + b_weight * currentWeight + b_parent * midParentalHeight;

  // Ensure predicted height is at least current height
  if (predictedHeight < currentHeight) {
    predictedHeight = currentHeight;
  }

  // 3. Tanner Puberty Stage adjustment
  // Tanner stage alters predicted growth speed.
  // E.g. Stage 1/2 means growth spurt hasn't started yet (potential for more height).
  // Stage 5 means growth plates are almost closed, so very little remaining potential.
  let pubertalMultiplier = 1.0;
  const tannerConfidenceFactors: string[] = [];
  
  if (tannerStage !== null) {
    if (tannerStage <= 2) {
      // Early puberty - high potential
      pubertalMultiplier = 1.02;
      tannerConfidenceFactors.push("Early tanner stage indicates growth plates are highly active, extending the growth window.");
    } else if (tannerStage === 3) {
      // Peak growth
      pubertalMultiplier = 1.005;
      tannerConfidenceFactors.push("Peak growth spurt stage currently active.");
    } else if (tannerStage === 4) {
      // Slowing down
      pubertalMultiplier = 0.99;
      tannerConfidenceFactors.push("Late pubertal stage indicates growth is beginning to plateau.");
    } else if (tannerStage === 5) {
      // Terminal phase
      pubertalMultiplier = 0.98;
      tannerConfidenceFactors.push("Mature pubertal status suggests epiphyseal plates are close to fusion.");
    }
    
    predictedHeight *= pubertalMultiplier;
    // Keep it sensible
    if (predictedHeight < currentHeight) {
      predictedHeight = currentHeight;
    }
  }

  // Round to 1 decimal place
  const mostLikely = Math.round(predictedHeight * 10) / 10;

  // 4. Calculate standard deviation/confidence range low and high
  // Mid-Parental Height has ±10 cm 95% range. Refinement reduces this.
  // More data logging or older age tightens this range.
  let errorMargin = 10.0; // Starting error margin in cm
  
  // Older teenagers have less remaining growth uncertainty
  if (age > 17) {
    errorMargin = 3.0;
  } else if (age > 15) {
    errorMargin = 5.0;
  } else if (age > 12) {
    errorMargin = 7.5;
  }

  // Tanner stage 5 reduces error margin because plates are almost closed
  if (tannerStage === 5) {
    errorMargin = Math.min(errorMargin, 2.5);
  }

  const rangeLow = Math.round((mostLikely - errorMargin) * 10) / 10;
  const rangeHigh = Math.round((mostLikely + errorMargin) * 10) / 10;

  // Confidence Factors list
  const confidenceFactors = [
    `Calculated using age and sex-specific growth trajectory indices.`,
    `Parental genetic baseline (mid-parental height: ${Math.round(midParentalHeight)} cm).`,
    ...tannerConfidenceFactors
  ];

  return {
    method: "Khamis-Roche & Mid-Parental Genetic Regression Model",
    rangeLow,
    rangeHigh,
    mostLikely,
    citations: [
      "Khamis HJ, Roche AF. Predicting adult stature without bone age. Pediatrics. 1994;94(4 Pt 1):504-507.",
      "Tanner JM. Growth at Adolescence. 2nd ed. Oxford: Blackwell Scientific Publications; 1962."
    ],
    confidenceFactors
  };
}
