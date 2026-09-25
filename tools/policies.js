/*
 * Decision-tree questionnaire mapping a review situation to the specific
 * Google review policy it most likely violates, plus a draft report and
 * an evidence checklist for that category.
 *
 * This is a guided checklist, not a magic classifier — it exists to make
 * sure every report cites a specific, real policy instead of a vague
 * "this is unfair" complaint, since specific policy citations are what
 * Google's review moderation actually acts on. It does not guarantee
 * removal; Google makes the final call.
 */

const POLICIES = {
  restricted_content: {
    label: "Restricted content (hate speech, threats, sexual/violent content)",
    summary:
      "The review contains hate speech targeting a protected group, threats of violence, or sexually explicit or graphic violent content, all of which are barred outright regardless of whether the reviewer was a genuine customer.",
    evidence: [
      "Screenshot of the full review, including the reviewer's name/profile and the timestamp.",
      "The exact URL of the review (from Google Maps or the Business Profile listing).",
      "If it targets a staff member by name, a note identifying who and how.",
    ],
    reportTemplate: ({ businessName, reviewerName, specificFacts }) =>
      `This review should be removed under Google's policy against restricted content. The review by ${reviewerName || "[reviewer name]"} on ${businessName || "[business name]"}'s listing contains hate speech, threats, or sexually explicit/graphic content that Google's review policy prohibits outright, independent of whether the reviewer is a customer. ${specificFacts || "[Describe specifically what the content contains and quote the relevant portion.]"} We ask that this review be removed for violating Google's restricted content policy.`,
  },
  personal_information: {
    label: "Personal information / doxxing",
    summary:
      "The review publishes private information about an identifiable individual — a home address, personal phone number, or similar — without their consent.",
    evidence: [
      "Screenshot of the review showing the personal information published.",
      "Confirmation the information belongs to a real, identifiable person (owner, staff, or otherwise) and wasn't already public.",
      "The exact URL of the review.",
    ],
    reportTemplate: ({ businessName, reviewerName, specificFacts }) =>
      `This review should be removed under Google's policy against sharing personal information. The review by ${reviewerName || "[reviewer name]"} on ${businessName || "[business name]"}'s listing publishes private personal information about an identifiable individual without consent. ${specificFacts || "[Specify what personal information was published and about whom.]"} This directly violates Google's policy prohibiting the disclosure of private information in reviews.`,
  },
  conflict_of_interest: {
    label: "Conflict of interest",
    summary:
      "The reviewer is a current or former employee, the business owner, or a competitor (or connected to one), reviewing to harm or unfairly help the business rather than sharing a genuine customer experience.",
    evidence: [
      "Any record showing the reviewer's relationship to the business (employment records, termination date, LinkedIn profile, ownership of a competing business).",
      "Confirmation there's no matching transaction, booking, or account tied to this reviewer.",
      "The exact URL and timestamp of the review, especially if it was posted shortly after a dispute (e.g. a termination).",
    ],
    reportTemplate: ({ businessName, reviewerName, specificFacts }) =>
      `This review should be removed under Google's policy against conflict-of-interest content. The reviewer, ${reviewerName || "[reviewer name]"}, is not a genuine customer of ${businessName || "[business name]"} — ${specificFacts || "[state the specific relationship: former employee, owner of a competing business, etc., and the factual basis for that claim]"}. This review does not reflect a real customer experience and violates Google's policy against reviews based on a conflict of interest.`,
  },
  off_topic_no_visit: {
    label: "Off-topic / no verifiable customer experience",
    summary:
      "The review isn't about a genuine experience with this specific business — wrong location, an unrelated rant, or no evidence the reviewer ever visited or transacted here.",
    evidence: [
      "A records check (POS, booking system, CRM) showing no match for the reviewer's name, dates, or details described.",
      "Notes on what specifically doesn't match (wrong service, wrong location, wrong dates, details that don't correspond to how the business actually operates).",
      "The exact URL and timestamp of the review.",
    ],
    reportTemplate: ({ businessName, reviewerName, specificFacts }) =>
      `This review should be removed under Google's policy requiring reviews to reflect a genuine customer experience. We have no record of ${reviewerName || "[reviewer name]"} as a customer of ${businessName || "[business name]"}. ${specificFacts || "[Describe the mismatch: no matching transaction/booking, details that don't correspond to this business, wrong location, etc.]"} This review does not describe a genuine experience with our business and should be removed as off-topic / not from a verified customer.`,
  },
  fake_spam: {
    label: "Fake engagement / spam",
    summary:
      "There's evidence the review was posted by a fake or bot-like account, was incentivized, or is duplicated near-verbatim across multiple unrelated listings — patterns Google's spam and fake engagement policy targets directly.",
    evidence: [
      "Screenshots showing the same or near-identical review text posted on other, unrelated businesses (if found).",
      "Notes on account signals suggesting it isn't a real reviewer (no profile history, generic name pattern, review posted in a suspicious burst with others).",
      "The exact URL and timestamp of the review.",
    ],
    reportTemplate: ({ businessName, reviewerName, specificFacts }) =>
      `This review should be removed under Google's policy against fake engagement and spam. The review by ${reviewerName || "[reviewer name]"} on ${businessName || "[business name]"}'s listing shows signs of not being a genuine, independent review. ${specificFacts || "[Describe the specific signal: duplicated text found elsewhere, no account history, part of a suspicious cluster of reviews, etc.]"} We ask that this be reviewed under Google's fake engagement and spam policy.`,
  },
};

const QUESTIONS = [
  {
    id: "restricted",
    text: "Does the review contain hate speech, threats of violence, or sexually explicit / graphic violent content?",
    match: "restricted_content",
  },
  {
    id: "personal_info",
    text: "Does the review publish private personal information about an identifiable person (home address, personal phone number, etc.)?",
    match: "personal_information",
  },
  {
    id: "conflict",
    text: "Is the reviewer a current/former employee, the business owner, or a competitor (or connected to one)?",
    match: "conflict_of_interest",
  },
  {
    id: "no_visit",
    text: "Do your records show no matching transaction, booking, or account for this reviewer, or does the review describe a different business/location?",
    match: "off_topic_no_visit",
  },
  {
    id: "fake",
    text: "Is there evidence this isn't a genuine, independent review (duplicated elsewhere, no account history, posted in a suspicious cluster)?",
    match: "fake_spam",
  },
];

/**
 * Runs the questions in priority order (most clear-cut policy violation
 * first) and returns the first one the caller confirmed "yes" to, plus
 * the remaining unanswered questions for the UI to still ask if the
 * caller wants a second opinion.
 */
function matchPolicy(answers) {
  for (const q of QUESTIONS) {
    if (answers[q.id] === "yes") {
      return { questionId: q.id, policyKey: q.match, policy: POLICIES[q.match] };
    }
  }
  return null;
}

export { POLICIES, QUESTIONS, matchPolicy };
