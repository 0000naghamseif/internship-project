const categoryKeywords = {
  Medical: [
    "patient",
    "doctor",
    "diagnosis",
    "hospital",
    "treatment",
    "medicine",
    "medical",
    "clinic",
    "prescription",
    "health"
  ],

  Education: [
    "student",
    "exam",
    "course",
    "university",
    "certificate",
    "teacher",
    "school",
    "lesson",
    "assignment",
    "grade"
  ],

  Finance: [
    "invoice",
    "payment",
    "tax",
    "amount",
    "bank",
    "salary",
    "receipt",
    "budget",
    "finance",
    "transaction"
  ],

  Legal: [
    "contract",
    "law",
    "legal",
    "agreement",
    "court",
    "license",
    "policy",
    "terms",
    "signature"
  ],

  Technology: [
    "devops",
    "software",
    "deployment",
    "cloud",
    "automation",
    "database",
    "api",
    "server",
    "application",
    "programming",
    "machine learning",
    "artificial intelligence",
    "generative ai",
    "gen ai",
    "model",
    "gemini"
  ],

  HumanResources: [
    "employee",
    "hr",
    "human resources",
    "recruitment",
    "attendance",
    "leave",
    "vacation",
    "position",
    "performance"
  ]
};

const suggestCategory = (text = "") => {
  const content = text.toLowerCase();

  const scores = {};

  for (const category in categoryKeywords) {
    scores[category] = 0;

    for (const keyword of categoryKeywords[category]) {
      if (content.includes(keyword.toLowerCase())) {
        scores[category] += 1;
      }
    }
  }

  const sortedCategories = Object.entries(scores).sort(
    (a, b) => b[1] - a[1]
  );

  const [bestCategory, bestScore] = sortedCategories[0];

  if (bestScore === 0) {
    return {
      suggestedCategory: "Uncategorized",
      confidence: 0,
      scores
    };
  }

  return {
    suggestedCategory: bestCategory,
    confidence: bestScore,
    scores
  };
};

module.exports = suggestCategory;