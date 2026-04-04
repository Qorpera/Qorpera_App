import type { SyntheticCompany } from "../../synthetic-types";
import { generateClutter, generateActivitySignals } from "../generator";
import { NK_EMPLOYEES, NK_CONNECTORS, NK_COMPANIES, NK_CONTACTS, NK_DEALS, NK_INVOICES, NK_SLACK_CHANNELS, NK_PROFILE, NK_CLUTTER_CONFIG } from "./profile";
import { NK_STORIES } from "./stories";
import { NK_CONTRADICTIONS } from "./contradictions";

const clutter = generateClutter(NK_PROFILE, NK_CLUTTER_CONFIG);
const activitySignals = generateActivitySignals(NK_PROFILE, { daysBack: 90, weekendActivity: false });

const NORDISK_KAPITAL: SyntheticCompany = {
  slug: "nordisk-kapital",
  name: "Nordisk Kapital A/S",
  industry: "M&A Advisory",
  domain: "nordisk-kapital.dk",
  employees: NK_EMPLOYEES,
  connectors: NK_CONNECTORS,
  companies: NK_COMPANIES,
  contacts: NK_CONTACTS,
  deals: NK_DEALS,
  invoices: NK_INVOICES,
  content: [...NK_STORIES, ...NK_CONTRADICTIONS, ...clutter],
  activitySignals,
  slackChannels: NK_SLACK_CHANNELS,
};

export default NORDISK_KAPITAL;
