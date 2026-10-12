/**
 * Worker thread for heavy analytics computations.
 * 
 * This offloads CPU-intensive calculations from the main thread.
 */
import { parentPort, workerData } from 'worker_threads';

/**
 * Calculate student rankings from marks data.
 */
function calculateRankings(students) {
  const ranked = [...students]
    .sort((a, b) => (b.average || 0) - (a.average || 0))
    .map((student, index) => ({
      ...student,
      rank: index + 1,
    }));
  
  return ranked;
}

/**
 * Calculate subject-wise statistics.
 */
function calculateSubjectStats(marks, subjects) {
  const statsBySubject = {};
  
  for (const subject of subjects) {
    const subjectMarks = marks.filter(m => m.subjectId === subject.id);
    const scores = subjectMarks
      .filter(m => m.outcome === 'SCORED' && m.marksObtained != null)
      .map(m => (m.marksObtained / subject.maxMarks) * 100);
    
    if (scores.length > 0) {
      const sorted = scores.sort((a, b) => a - b);
      const sum = scores.reduce((acc, val) => acc + val, 0);
      
      statsBySubject[subject.id] = {
        subjectId: subject.id,
        subjectName: subject.name,
        count: scores.length,
        average: sum / scores.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        median: sorted[Math.floor(sorted.length / 2)],
        q1: sorted[Math.floor(sorted.length * 0.25)],
        q3: sorted[Math.floor(sorted.length * 0.75)],
      };
    }
  }
  
  return statsBySubject;
}

/**
 * Calculate grade distribution.
 */
function calculateGradeDistribution(students, gradeBands) {
  const distribution = {};
  
  for (const band of gradeBands) {
    distribution[band.grade] = 0;
  }
  
  for (const student of students) {
    if (student.average != null) {
      for (const band of gradeBands) {
        if (student.average >= band.min) {
          distribution[band.grade]++;
          break;
        }
      }
    }
  }
  
  return distribution;
}

/**
 * Main worker computation.
 */
try {
  const { operation, data } = workerData;
  
  let result;
  
  switch (operation) {
    case 'rankings':
      result = calculateRankings(data.students);
      break;
      
    case 'subjectStats':
      result = calculateSubjectStats(data.marks, data.subjects);
      break;
      
    case 'gradeDistribution':
      result = calculateGradeDistribution(data.students, data.gradeBands);
      break;
      
    case 'fullAnalytics':
      // Compute multiple metrics in one go
      result = {
        rankings: calculateRankings(data.students),
        subjectStats: calculateSubjectStats(data.marks, data.subjects),
        gradeDistribution: calculateGradeDistribution(data.students, data.gradeBands),
      };
      break;
      
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
  
  // Send result back to main thread
  parentPort.postMessage(result);
} catch (error) {
  // Send error back to main thread
  parentPort.postMessage({
    error: error.message,
    stack: error.stack,
  });
}
