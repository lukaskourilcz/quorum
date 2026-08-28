import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  parseDistributionContact,
  parseDistributionContactEvent,
  parseSocialShareKit,
  parseSocialShareKitOutcomeEvent,
  projectAdminDistributionContact,
  projectAdminSocialShareKit,
  type DistributionContactEventRecord,
  type DistributionContactRecord,
  type SocialShareKitOutcomeEventRecord,
  type SocialShareKitRecord
} from "./network-model";

export interface AdminDistributionNetworkSnapshot {
  contacts: DistributionContactRecord[];
  contactEvents: DistributionContactEventRecord[];
  shareKits: SocialShareKitRecord[];
  shareKitEvents: SocialShareKitOutcomeEventRecord[];
  benchmark: {
    target: 50;
    actual: number;
    optedInOrActive: number;
    fabricatedProgress: false;
  };
  dropped: {
    contacts: number;
    contactEvents: number;
    shareKits: number;
    shareKitEvents: number;
  };
}

async function readDirectory<T>(root: string, relative: string, parse: (value: unknown) => T | null): Promise<{ accepted: T[]; dropped: number }> {
  const directory = path.join(root, relative);
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (files === null) return { accepted: [], dropped: 1 };
  const accepted: T[] = [];
  let dropped = 0;
  for (const file of files.filter((name) => name.endsWith(".json")).sort().slice(0, 2_000)) {
    try {
      const parsed = parse(JSON.parse(await readFile(path.join(directory, file), "utf8")) as unknown);
      if (parsed) accepted.push(parsed);
      else dropped += 1;
    } catch {
      dropped += 1;
    }
  }
  return { accepted, dropped };
}

export async function readAdminDistributionNetwork(root: string, now: Date): Promise<AdminDistributionNetworkSnapshot> {
  const [contacts, contactEvents, kits, kitEvents] = await Promise.all([
    readDirectory(root, "state/social/network/contacts", parseDistributionContact),
    readDirectory(root, "state/social/network/contact-events", parseDistributionContactEvent),
    readDirectory(root, "state/social/network/share-kits", parseSocialShareKit),
    readDirectory(root, "state/social/network/share-kit-events", parseSocialShareKitOutcomeEvent)
  ]);
  const projectedContacts = contacts.accepted
    .map((contact) => projectAdminDistributionContact(contact, contactEvents.accepted))
    .sort((left, right) => left.label.localeCompare(right.label));
  const projectedKits = kits.accepted
    .map((kit) => projectAdminSocialShareKit(kit, kitEvents.accepted, now))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    contacts: projectedContacts,
    contactEvents: contactEvents.accepted.sort((left, right) => right.at.localeCompare(left.at)),
    shareKits: projectedKits,
    shareKitEvents: kitEvents.accepted.sort((left, right) => right.at.localeCompare(left.at)),
    benchmark: {
      target: 50,
      actual: projectedContacts.length,
      optedInOrActive: projectedContacts.filter(({ relationshipStatus }) => ["opted-in", "active"].includes(relationshipStatus)).length,
      fabricatedProgress: false
    },
    dropped: {
      contacts: contacts.dropped,
      contactEvents: contactEvents.dropped,
      shareKits: kits.dropped,
      shareKitEvents: kitEvents.dropped
    }
  };
}
