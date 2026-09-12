# QRoll

Use the best and nicest low cost in token template for this project, My School's name is KWAME NKRUMAH UNIVERSITY OF SCIENCE AND TECHNOLOGY (KNUST) . NOW THE PROMPT: BUILD A COMPLETE PRODUCTION-READY UNIVERSITY QR ATTENDANCE MANAGEMENT SYSTEM

OVERVIEW

Create a fully functional, secure, scalable, production-ready University Attendance Management Platform.

The platform will be used by:

Administrators

Lecturers

Teaching Assistants

The system must support:

Level 100

Level 200

Level 300

Level 400

The system must support:

Multiple Courses

Multiple Departments

Multiple Academic Years

Multiple Semesters

Multiple Teaching Assistants

Multiple Concurrent Scanners

The system must be mobile-friendly, responsive, installable as a PWA, and optimized for both phones and computers.

PRIMARY OBJECTIVE

Every registered student will have a secure QR code.

Teaching Assistants will scan student QR codes during attendance sessions.

Attendance must be recorded accurately, securely, and permanently.

The system must prevent:

Duplicate attendance

Attendance fraud

Unauthorized editing

Data corruption

Data loss

================================================
FREE TECHNOLOGY STACK (MANDATORY)

Use only free or open-source solutions whenever possible.

Frontend:

React

TypeScript

Tailwind CSS

Backend:

Supabase

Database:

PostgreSQL (Supabase)

Authentication:

Supabase Auth

Storage:

Supabase Storage

Charts:

Open-source chart libraries

QR Generation:

Open-source QR libraries

QR Scanning:

Open-source QR scanner libraries

PDF Export:

Open-source PDF libraries

Excel Export:

Open-source XLSX libraries

Build the system so that no paid APIs are required.

Do not use:

Stripe

Twilio

Paid QR services

Paid analytics tools

Paid OCR services

Any service requiring mandatory monthly subscriptions

==================================================
USER ROLES

SUPER ADMIN

Can:

Manage entire system

Manage users

Manage courses

Manage students

Manage lecturers

Manage teaching assistants

Manage semesters

Manage academic years

Manage backups

Restore archives

View audit logs

Edit attendance records

ADMIN

Can:

Manage students

Manage courses

Manage sessions

Generate reports

LECTURER

Can:

View attendance

View reports

Export reports

TEACHING ASSISTANT

Can:

Create attendance sessions

Open attendance scanner

Scan QR codes

View session attendance

Cannot:

Delete records

Edit records

==================================================
STUDENT MANAGEMENT

Store:

Full Name

Index Number

Department

Program

Level

Email

Academic Year

Status

Support:

Manual student creation

Bulk Excel import

CSV import

Automatically:

Validate records

Detect duplicates

Generate QR identifiers

Generate QR codes

==================================================
QR SECURITY

Never store:

Student Name

Index Number

inside QR codes.

Instead generate secure UUID identifiers.

Example:

QR_ID = UUID

When scanned:

Read UUID

Lookup student

Process attendance

Prevent QR tampering.

==================================================
COURSE MANAGEMENT

Store:

Course Code

Course Title

Level

Department

Lecturer

Academic Year

Semester

Credit Hours

Support:

Course creation

Course editing

Course archiving

==================================================
COURSE REGISTRATION

Students may register for multiple courses.

Courses may contain multiple students.

Implement many-to-many relationship.

Attendance may only be recorded if:

Student is registered for selected course.

Otherwise reject attendance.

==================================================
ATTENDANCE WORKFLOW

Teaching Assistant workflow:

Login

Select Academic Year

Select Semester

Select Level

Select Course

Select Session

Open Scanner

==================================================
TWO-SCAN ATTENDANCE SYSTEM

FIRST SCAN

Create attendance record.

Record:

Student ID

Session ID

Check-In Timestamp

Status:

IN_PROGRESS

SECOND SCAN

Update existing record.

Record:

Check-Out Timestamp

Duration

Status:

PRESENT

THIRD SCAN

Reject.

Display:

Attendance already completed for this session.

==================================================
ATTENDANCE STATUS

Supported statuses:

PRESENT

ABSENT

IN_PROGRESS

LATE_ARRIVAL

LEFT_EARLY

==================================================
LATE ARRIVAL DETECTION

Allow configurable grace period.

Automatically calculate:

Late Minutes

==================================================
EARLY DEPARTURE DETECTION

Automatically calculate:

Early Departure Minutes

==================================================
AUTOMATIC ABSENCE DETECTION

When session closes:

Students without attendance records become:

ABSENT

==================================================
ATTENDANCE PERCENTAGE

Calculate:

(Present Sessions ÷ Total Sessions) × 100

Default minimum:

75%

Flag students below threshold.

==================================================
REPORTING

Generate:

Daily Reports

Course Reports

Level Reports

Semester Reports

Student Reports

Attendance Percentage Reports

Absentee Reports

Late Arrival Reports

Early Departure Reports

Export:

PDF

Excel

CSV

==================================================
DASHBOARD

Display:

Total Students

Total Courses

Total Sessions

Present Students

Absent Students

Students Currently In Class

Late Arrivals

Early Departures

Attendance Percentages

Update in real time.

==================================================
AUDIT LOGGING

Log:

User

Role

Action

Timestamp

Previous Value

New Value

Track all critical actions.

==================================================
BACKUPS

Implement:

Real-time saving

Daily backups

Weekly backups

Manual backups

Backup verification

==================================================
SEMESTER ARCHIVING

At semester end:

Allow Super Admin to:

Close Semester

Lock Attendance Records

Export All Reports

Create Full Backup

Archive Semester

After archiving:

New semester starts with empty attendance sessions.

Students remain in system.

Courses remain in system.

Historical records remain accessible.

Provide:

"Archive Semester" button.

Provide:

"Restore Archived Semester" option.

Do NOT permanently delete historical attendance by default.

==================================================
PERFORMANCE REQUIREMENTS

Support:

10,000+ students

100+ courses

Millions of attendance records

Attendance scan response:

Less than 2 seconds.

System must remain reliable under concurrent scanning.

==================================================
SECURITY

Implement:

Role Based Access Control

Supabase Row Level Security

JWT Authentication

Secure API Access

Audit Logs

Database Constraints

Duplicate Prevention

Atomic Transactions

==================================================
FINAL GOAL

Generate a complete production-ready university attendance management system with all database schemas, authentication, dashboards, reports, QR generation, QR scanning, attendance tracking, backups, semester archiving, security policies, APIs, responsive UI, PWA support, and deployment configuration fully implemented and connected to Supabase. .... One additional cost-saving feature you can ask Lovable to build:

"Database Cleanup Wizard"

Instead of deleting records, it should:

Archive old semesters.

Compress exports.

Remove temporary scan logs older than a configurable period (e.g., 90 days).

Keep only essential historical data.

That reduces storage usage while preserving attendance history.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://qroll-app.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c59c5c67-29c7-46a7-9d5a-e5c13162beda).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
