import type { SyntheticCompany } from "../../synthetic-types";
import { generateClutter, generateActivitySignals, generateOperationalContent } from "../generator";
import { HANSENS_EMPLOYEES, HANSENS_CONNECTORS, HANSENS_COMPANIES, HANSENS_CONTACTS, HANSENS_DEALS, HANSENS_INVOICES, HANSENS_SLACK_CHANNELS, HANSENS_PROFILE, HANSENS_CLUTTER_CONFIG, HANSENS_OPERATIONAL_CONFIG } from "./profile";
import { HANSENS_STORIES } from "./stories";
import { HANSENS_CONTRADICTIONS } from "./contradictions";

const clutter = generateClutter(HANSENS_PROFILE, HANSENS_CLUTTER_CONFIG);
const operational = generateOperationalContent(HANSENS_PROFILE, HANSENS_OPERATIONAL_CONFIG as any);
const activitySignals = generateActivitySignals(HANSENS_PROFILE, { daysBack: 30, weekendActivity: false });

const HANSENS_IS: SyntheticCompany = {
  slug: "hansens-is",
  name: "Hansens Flødeis ApS",
  industry: "Organic Ice Cream Production & Distribution",
  domain: "hansens-is.dk",
  employees: HANSENS_EMPLOYEES,
  connectors: HANSENS_CONNECTORS,
  companies: HANSENS_COMPANIES,
  contacts: HANSENS_CONTACTS,
  deals: HANSENS_DEALS,
  invoices: HANSENS_INVOICES,
  content: [...HANSENS_STORIES, ...HANSENS_CONTRADICTIONS, ...operational, ...clutter],
  activitySignals,
  slackChannels: HANSENS_SLACK_CHANNELS,
};

export default HANSENS_IS;
