export interface Workspace {
  id: string;
  name: string;
  publications: number;
  score: number;
  sparkData: number[];
  lastUpdated: number;
  createdBy?: string;
}

const NOW = 1746403200000; // 2026-05-05
const ago = (days: number) => NOW - days * 86_400_000;

export const YOUR_WORKSPACES: Workspace[] = [
  { id: 'yw-1', name: 'Oncology',       publications: 342, score: 1245, sparkData: [40, 38, 45, 35, 42, 48, 46, 52], lastUpdated: ago(2)  },
  { id: 'yw-2', name: 'Endometriosis',  publications: 187, score: 892,  sparkData: [30, 38, 34, 42, 36, 32, 35, 31], lastUpdated: ago(14) },
  { id: 'yw-3', name: 'Lenalidomide',   publications: 523, score: 1567, sparkData: [35, 32, 38, 34, 40, 44, 50, 55], lastUpdated: ago(1)  },
  { id: 'yw-4', name: 'Cardiovascular', publications: 891, score: 2103, sparkData: [55, 48, 52, 44, 38, 42, 46, 40], lastUpdated: ago(45) },
  { id: 'yw-5', name: 'Lung Cancer',    publications: 412, score: 1089, sparkData: [32, 38, 35, 40, 42, 38, 36, 34], lastUpdated: ago(7)  },
];

export const SHARED_WORKSPACES: Workspace[] = [
  { id: 'sw-1',  name: 'Breast Cancer',           publications: 634, score: 1823, sparkData: [42, 50, 45, 52, 48, 55, 60, 58], lastUpdated: ago(3),  createdBy: 'Sarah Chen' },
  { id: 'sw-2',  name: "Alzheimer's Disease",      publications: 289, score: 743,  sparkData: [25, 32, 28, 35, 30, 38, 34, 30], lastUpdated: ago(60), createdBy: 'David Park' },
  { id: 'sw-3',  name: 'Type 2 Diabetes',          publications: 756, score: 2241, sparkData: [60, 55, 58, 52, 56, 60, 64, 68], lastUpdated: ago(1),  createdBy: 'Maria Santos' },
  { id: 'sw-4',  name: 'CRISPR Gene Editing',      publications: 423, score: 1156, sparkData: [38, 42, 48, 44, 50, 46, 52, 56], lastUpdated: ago(10), createdBy: 'James Wilson' },
  { id: 'sw-5',  name: 'Immunotherapy',            publications: 812, score: 2389, sparkData: [55, 60, 58, 64, 60, 66, 62, 58], lastUpdated: ago(5),  createdBy: 'Emma Roberts' },
  { id: 'sw-6',  name: 'Multiple Sclerosis',       publications: 356, score: 967,  sparkData: [32, 38, 35, 40, 36, 42, 38, 34], lastUpdated: ago(22), createdBy: 'Michael Lee' },
  { id: 'sw-7',  name: "Parkinson's Disease",      publications: 198, score: 534,  sparkData: [15, 22, 18, 25, 20, 28, 24, 20], lastUpdated: ago(90), createdBy: 'Lisa Thompson' },
  { id: 'sw-8',  name: 'Rheumatoid Arthritis',     publications: 445, score: 1234, sparkData: [44, 48, 52, 46, 50, 44, 48, 52], lastUpdated: ago(8),  createdBy: 'Robert Chen' },
  { id: 'sw-9',  name: 'Pancreatic Cancer',        publications: 267, score: 689,  sparkData: [28, 32, 30, 36, 32, 38, 34, 30], lastUpdated: ago(35), createdBy: 'Anna Williams' },
  { id: 'sw-10', name: 'Antibody Drug Conjugates', publications: 534, score: 1478, sparkData: [48, 52, 50, 56, 52, 58, 54, 58], lastUpdated: ago(18), createdBy: 'Tom Harris' },
  { id: 'sw-11', name: 'NASH / NAFLD',             publications: 389, score: 1023, sparkData: [35, 40, 38, 44, 40, 46, 42, 38], lastUpdated: ago(12), createdBy: 'Jessica Kim' },
  { id: 'sw-12', name: 'Cell & Gene Therapy',      publications: 678, score: 1892, sparkData: [50, 55, 52, 58, 54, 60, 58, 62], lastUpdated: ago(4),  createdBy: 'Andrew Brown' },
];
