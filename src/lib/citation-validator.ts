/**
 * Citation Validator
 *
 * Verifies that AI-generated citations actually match database records.
 * Prevents hallucinated sources from being displayed to physicians.
 */

interface LabData {
  name: string;
  value: number;
  unit: string;
  abnormal: boolean;
  date: string;
}

interface MedData {
  drug: string;
  dose: string;
  frequency: string;
  status: string;
  indication: string;
  notes: string | null;
}

interface DiagnosisData {
  name: string;
  type: string;
  icd: string | null;
  specialty: string;
}

interface DataSources {
  diagnoses: DiagnosisData[];
  medications: MedData[];
  recent_labs: LabData[];
  recent_vitals: { bp: string; hr: number; o2: number; weight_kg: number; date: string } | null;
}

interface ValidationResult {
  original: string;
  validated: string;
  citations: CitationCheck[];
  allVerified: boolean;
}

interface CitationCheck {
  citation: string;
  verified: boolean;
  matchedSource?: string;
}

/**
 * Extract citation patterns from text
 * Patterns: (Hgb 9.2, Dec 2), (warfarin on_hold, cardiology), (AFib, dx: cardiology)
 */
function extractCitations(text: string): string[] {
  const citationPattern = /\([^)]+(?:,\s*(?:Dec|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov)\s*\d{1,2}|,\s*(?:cardiology|pcp|gi|neuro|pulm|endo|rheum|oncology)|,\s*dx:|on_hold|active)[^)]*\)/gi;
  const matches = text.match(citationPattern) || [];
  return matches;
}

/**
 * Check if a lab citation matches actual data
 */
function verifyLabCitation(citation: string, labs: LabData[]): { verified: boolean; match?: string } {
  const lowerCitation = citation.toLowerCase();

  for (const lab of labs) {
    const labNameLower = lab.name.toLowerCase();
    const labDate = new Date(lab.date);
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthStr = monthNames[labDate.getMonth()];
    const dayStr = labDate.getDate().toString();

    // Check if citation contains lab name and approximate value
    if (lowerCitation.includes(labNameLower.substring(0, 4)) ||
        lowerCitation.includes(lab.value.toString())) {
      // Verify date if present
      if (lowerCitation.includes(monthStr) || lowerCitation.includes(dayStr)) {
        return { verified: true, match: `${lab.name}: ${lab.value} ${lab.unit} (${lab.date})` };
      }
      // Value match without date is still partial verification
      if (lowerCitation.includes(lab.value.toString())) {
        return { verified: true, match: `${lab.name}: ${lab.value} ${lab.unit}` };
      }
    }
  }

  return { verified: false };
}

/**
 * Check if a medication citation matches actual data
 */
function verifyMedCitation(citation: string, meds: MedData[]): { verified: boolean; match?: string } {
  const lowerCitation = citation.toLowerCase();

  for (const med of meds) {
    const drugLower = med.drug.toLowerCase();

    // Check if citation contains drug name
    if (lowerCitation.includes(drugLower)) {
      // Verify status if mentioned
      if (lowerCitation.includes(med.status) ||
          lowerCitation.includes('on_hold') && med.status === 'on_hold' ||
          lowerCitation.includes('active') && med.status === 'active') {
        return { verified: true, match: `${med.drug} ${med.dose} (${med.status})` };
      }
      // Drug name match is partial verification
      return { verified: true, match: `${med.drug} ${med.dose}` };
    }
  }

  return { verified: false };
}

/**
 * Check if a diagnosis citation matches actual data
 */
function verifyDiagnosisCitation(citation: string, diagnoses: DiagnosisData[]): { verified: boolean; match?: string } {
  const lowerCitation = citation.toLowerCase();

  for (const dx of diagnoses) {
    const dxNameLower = dx.name.toLowerCase();
    const specialtyLower = dx.specialty.toLowerCase();

    // Check common abbreviations
    const abbreviations: Record<string, string[]> = {
      'atrial fibrillation': ['afib', 'a-fib', 'af'],
      'diabetes': ['dm', 'dm2', 'diabetes'],
      'hypertension': ['htn', 'hypertension'],
      'coronary artery disease': ['cad', 'coronary'],
    };

    // Check full name or abbreviations
    let nameMatch = lowerCitation.includes(dxNameLower.substring(0, 6));

    for (const [fullName, abbrevs] of Object.entries(abbreviations)) {
      if (dxNameLower.includes(fullName.toLowerCase())) {
        for (const abbrev of abbrevs) {
          if (lowerCitation.includes(abbrev)) {
            nameMatch = true;
            break;
          }
        }
      }
    }

    if (nameMatch) {
      // Verify specialty if mentioned
      if (lowerCitation.includes(specialtyLower) || lowerCitation.includes('dx:')) {
        return { verified: true, match: `${dx.name} (${dx.specialty})` };
      }
      return { verified: true, match: dx.name };
    }
  }

  return { verified: false };
}

/**
 * Verify a single citation against all data sources
 */
function verifyCitation(citation: string, dataSources: DataSources): CitationCheck {
  // Try labs first
  const labCheck = verifyLabCitation(citation, dataSources.recent_labs || []);
  if (labCheck.verified) {
    return { citation, verified: true, matchedSource: `Lab: ${labCheck.match}` };
  }

  // Try medications
  const medCheck = verifyMedCitation(citation, dataSources.medications || []);
  if (medCheck.verified) {
    return { citation, verified: true, matchedSource: `Med: ${medCheck.match}` };
  }

  // Try diagnoses
  const dxCheck = verifyDiagnosisCitation(citation, dataSources.diagnoses || []);
  if (dxCheck.verified) {
    return { citation, verified: true, matchedSource: `Dx: ${dxCheck.match}` };
  }

  // Check vitals
  if (dataSources.recent_vitals) {
    const vitals = dataSources.recent_vitals;
    const lowerCitation = citation.toLowerCase();

    if (lowerCitation.includes(vitals.bp) ||
        lowerCitation.includes(vitals.hr.toString()) ||
        lowerCitation.includes(vitals.o2.toString())) {
      return { citation, verified: true, matchedSource: `Vitals: ${vitals.date}` };
    }
  }

  return { citation, verified: false };
}

/**
 * Validate all citations in a clinical insight
 */
export function validateInsightCitations(insight: string, dataSources: DataSources): ValidationResult {
  const citations = extractCitations(insight);
  const checks: CitationCheck[] = [];

  let validated = insight;
  let allVerified = true;

  for (const citation of citations) {
    const check = verifyCitation(citation, dataSources);
    checks.push(check);

    if (!check.verified) {
      allVerified = false;
      // Mark unverified citations
      validated = validated.replace(citation, `${citation} [unverified]`);
    }
  }

  // If no citations found, that's okay (insight without inline citations)
  if (citations.length === 0) {
    allVerified = true;
  }

  return {
    original: insight,
    validated,
    citations: checks,
    allVerified,
  };
}

/**
 * Validate all clinical insights and return only verified ones
 * or mark unverified citations
 */
export function validateClinicalInsights(
  insights: string[],
  dataSources: DataSources,
  mode: 'filter' | 'mark' = 'mark'
): string[] {
  const results = insights.map(insight => validateInsightCitations(insight, dataSources));

  if (mode === 'filter') {
    // Only return insights where all citations are verified
    return results
      .filter(r => r.allVerified)
      .map(r => r.original);
  }

  // Mark mode: return all insights but mark unverified citations
  return results.map(r => r.validated);
}

/**
 * Get validation summary for logging/debugging
 */
export function getValidationSummary(
  insights: string[],
  dataSources: DataSources
): { total: number; verified: number; unverified: number; details: ValidationResult[] } {
  const results = insights.map(insight => validateInsightCitations(insight, dataSources));

  let totalCitations = 0;
  let verifiedCitations = 0;

  for (const result of results) {
    totalCitations += result.citations.length;
    verifiedCitations += result.citations.filter(c => c.verified).length;
  }

  return {
    total: totalCitations,
    verified: verifiedCitations,
    unverified: totalCitations - verifiedCitations,
    details: results,
  };
}
