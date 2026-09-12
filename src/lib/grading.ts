/**
 * University Attendance Grading System
 *
 * Grading Scale:
 * - 80% to 100%: 10 marks
 * - 75% to 79%: 8 marks
 * - 70% to 74%: 6 marks
 * - 65% to 69%: 4 marks
 * - Below 65%: 0 marks
 */

export interface AttendanceGradeResult {
  marks: number;
  maxMarks: number;
  label: string;
  badgeVariant: "default" | "secondary" | "outline" | "destructive";
}

export function calculateAttendanceGrade(percentage: number): AttendanceGradeResult {
  const pct = Math.max(0, Math.round(percentage));
  if (pct >= 80) {
    return { marks: 10, maxMarks: 10, label: "10/10 Marks", badgeVariant: "default" };
  }
  if (pct >= 75) {
    return { marks: 8, maxMarks: 10, label: "8/10 Marks", badgeVariant: "secondary" };
  }
  if (pct >= 70) {
    return { marks: 6, maxMarks: 10, label: "6/10 Marks", badgeVariant: "outline" };
  }
  if (pct >= 65) {
    return { marks: 4, maxMarks: 10, label: "4/10 Marks", badgeVariant: "outline" };
  }
  return { marks: 0, maxMarks: 10, label: "0/10 Marks", badgeVariant: "destructive" };
}
