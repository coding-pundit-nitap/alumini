// Word lists for the performance seed. Plausible, not real people: combinations repeat at 10 000 users, as
// real names do, which is what a name search has to cope with.

// prettier-ignore
export const FIRST_NAMES = [
  "Aarav", "Aditi", "Akash", "Ananya", "Anil", "Anjali", "Arjun", "Asha", "Bhavna", "Chetan",
  "Deepa", "Dev", "Divya", "Gaurav", "Gita", "Harsh", "Isha", "Jaya", "Kabir", "Kavya",
  "Kiran", "Lakshmi", "Manish", "Meera", "Mohan", "Nabam", "Neha", "Nikhil", "Nisha", "Pooja",
  "Pradeep", "Priya", "Rahul", "Rajesh", "Ravi", "Riya", "Rohan", "Sanjay", "Sara", "Shreya",
  "Sneha", "Sunil", "Tage", "Tanvi", "Tarun", "Uma", "Varun", "Vidya", "Vikram", "Yamini",
  "Yash", "Zara", "Bengia", "Doni", "Hage", "Kento", "Likha", "Nyishi", "Oyin", "Yomgam",
] as const;

// prettier-ignore
export const LAST_NAMES = [
  "Agarwal", "Bhattacharya", "Bora", "Chakraborty", "Das", "Deka", "Gogoi", "Gupta", "Iyer", "Jain",
  "Joshi", "Kapoor", "Khan", "Kumar", "Mehta", "Mishra", "Nair", "Pandey", "Patel", "Pertin",
  "Rao", "Reddy", "Saikia", "Sharma", "Singh", "Sinha", "Tamang", "Tayeng", "Verma", "Yadav",
  "Taba", "Riba", "Ete", "Ronya", "Doley", "Mize", "Nabam", "Tara", "Bagra", "Lollen",
] as const;

// prettier-ignore
export const COMPANIES = [
  "Infosys", "Tata Consultancy Services", "Wipro", "HCLTech", "Tech Mahindra", "Larsen & Toubro",
  "Reliance Industries", "Indian Oil", "ONGC", "NTPC", "Power Grid", "BHEL", "ISRO", "DRDO",
  "Google", "Microsoft", "Amazon", "Flipkart", "Zomato", "Swiggy", "Paytm", "Razorpay", "Zoho",
  "Freshworks", "Siemens", "Bosch", "Schneider Electric", "Qualcomm", "Intel", "Texas Instruments",
  "NHPC", "North Eastern Electric Power", "Arunachal PWD", "Indian Railways", "Accenture",
  "Deloitte", "Capgemini", "Cognizant", "Samsung R&D", "Ather Energy",
] as const;

// prettier-ignore
export const INDUSTRIES = [
  "Software", "Energy", "Construction", "Manufacturing", "Telecommunications", "Research",
  "Public Sector", "Consulting", "Finance", "Semiconductors", "Transport", "Education",
] as const;

// prettier-ignore
export const DESIGNATIONS = [
  "Software Engineer", "Senior Software Engineer", "Data Engineer", "Site Engineer", "Design Engineer",
  "Project Engineer", "Assistant Engineer", "Executive Engineer", "Research Scientist", "Product Manager",
  "Engineering Manager", "Consultant", "Analyst", "Lecturer", "Assistant Professor", "Founder",
  "Technical Lead", "Hardware Engineer", "Embedded Engineer", "Network Engineer",
] as const;

// prettier-ignore
export const SKILLS = [
  "TypeScript", "Python", "Java", "Go", "Rust", "C++", "React", "Node.js", "PostgreSQL", "Kubernetes",
  "Docker", "AWS", "Machine Learning", "Data Analysis", "VLSI", "Embedded Systems", "PCB Design",
  "Power Systems", "AutoCAD", "STAAD Pro", "Structural Analysis", "Surveying", "SolidWorks", "ANSYS",
  "MATLAB", "Signal Processing", "Control Systems", "Project Management", "Public Speaking", "Leadership",
  "Hydropower", "Renewable Energy", "Networking", "Linux", "Cloud Architecture", "Android",
] as const;

// prettier-ignore
export const CITIES = [
  "Itanagar", "Naharlagun", "Pasighat", "Yupia", "Guwahati", "Shillong", "Kolkata", "Bengaluru",
  "Hyderabad", "Pune", "Mumbai", "New Delhi", "Gurugram", "Noida", "Chennai", "Ahmedabad",
  "Bhubaneswar", "Dibrugarh", "Tezpur", "Singapore", "Dubai", "London", "Berlin", "Seattle",
] as const;

// prettier-ignore
export const INSTITUTIONS = [
  "IIT Guwahati", "IIT Bombay", "IISc Bengaluru", "NIT Silchar", "IIM Shillong", "Rajiv Gandhi University",
  "TU Munich", "National University of Singapore", "University of Toronto", "IIT Delhi",
] as const;

// prettier-ignore
export const TOPICS = [
  "career", "higher-studies", "interviews", "startups", "research", "public-sector", "gate",
  "placements", "core-engineering", "software", "abroad", "entrepreneurship",
] as const;

const SENTENCES = [
  "Delighted to share that our team shipped the new release this week.",
  "Looking for referrals for a few openings in my team, message me if interested.",
  "Throwback to the annual tech fest at Yupia, those were the days.",
  "Wrote a short note on preparing for GATE while working full time.",
  "Our department alumni meet is coming up next month, please register.",
  "Any batchmates in Bengaluru up for a meetup this weekend?",
  "Grateful to my mentors from NIT Arunachal Pradesh for the guidance.",
  "Sharing a few lessons from three years of building hydropower projects.",
  "We are hiring interns for the summer, students please apply through the jobs board.",
  "Congratulations to the students who cleared their campus placements this year.",
  "Read an excellent paper on power grid stability, happy to discuss.",
  "Started a reading group on distributed systems, join if you like.",
  "Visited the campus after five years, the new hostel blocks look great.",
  "Tips for a first job: ask questions early and write things down.",
  "Our startup just closed its first round, thank you all for the support.",
];

// Real posts and messages carry emoji (multi-code-unit, some with ZWJ sequences and skin tones), which length
// checks, trigram search and rendering all have to handle. Empty entries keep most sentences plain.
// prettier-ignore
const EMOJI = [
  "", "", "", "", "", "", "🎉", "🙏", "👏", "🚀", "😊", "😂", "❤️", "🔥", "💡", "🎓", "✅", "👍🏽",
  "🇮🇳", "👩‍💻", "👨‍🔬", "🧑🏻‍🏫", "🏔️", "☕",
] as const;

export function paragraph(
  pick: <T>(items: readonly T[]) => T,
  sentences: number
): string {
  return Array.from({ length: sentences }, () => {
    const emoji = pick(EMOJI);
    return emoji ? `${pick(SENTENCES)} ${emoji}` : pick(SENTENCES);
  }).join(" ");
}
