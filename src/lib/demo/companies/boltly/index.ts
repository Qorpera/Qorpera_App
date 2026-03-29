import type { SyntheticCompany } from "../../synthetic-types";
import { generateClutter, generateActivitySignals } from "../generator";
import { BOLTLY_EMPLOYEES, BOLTLY_CONNECTORS, BOLTLY_COMPANIES, BOLTLY_CONTACTS, BOLTLY_DEALS, BOLTLY_INVOICES, BOLTLY_SLACK_CHANNELS, BOLTLY_PROFILE, BOLTLY_CLUTTER_CONFIG } from "./profile";
import { BOLTLY_STORIES } from "./stories";
import { BOLTLY_CONTRADICTIONS } from "./contradictions";

const clutter = generateClutter(BOLTLY_PROFILE, BOLTLY_CLUTTER_CONFIG);
const activitySignals = generateActivitySignals(BOLTLY_PROFILE, { daysBack: 90, weekendActivity: false });

const BOLTLY: SyntheticCompany = {
  slug: "boltly",
  name: "Boltly ApS",
  industry: "Electrical Installation & Service",
  domain: "boltly.dk",
  employees: BOLTLY_EMPLOYEES,
  connectors: BOLTLY_CONNECTORS,
  companies: BOLTLY_COMPANIES,
  contacts: BOLTLY_CONTACTS,
  deals: BOLTLY_DEALS,
  invoices: BOLTLY_INVOICES,
  content: [...BOLTLY_STORIES, ...BOLTLY_CONTRADICTIONS, ...clutter],
  activitySignals,
  slackChannels: BOLTLY_SLACK_CHANNELS,
};

export default BOLTLY;
