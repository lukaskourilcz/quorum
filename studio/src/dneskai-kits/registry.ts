import { EDITORIAL_KIT } from "./editorial.js";
import { MAGAZINE_KIT } from "./magazine.js";
import type { DneskaiKit } from "./kit.js";
import type { DneskaiKitId } from "./contract.js";
/** Only implemented kits are offered. Future designs require the owner's decision. */
export const DNESKAI_KITS:ReadonlyMap<DneskaiKitId,DneskaiKit>=new Map([[EDITORIAL_KIT.id,EDITORIAL_KIT],[MAGAZINE_KIT.id,MAGAZINE_KIT]]);
export const dneskaiKit=(id:string):DneskaiKit|null=>DNESKAI_KITS.get(id as DneskaiKitId)??null;
