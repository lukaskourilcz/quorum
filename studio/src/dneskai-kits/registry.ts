import { EDITORIAL_KIT } from "./editorial.js";
import { BOLD_KIT } from "./bold.js";
import type { DneskaiKit } from "./kit.js";
import type { DneskaiKitId } from "./contract.js";
/** Only implemented kits are offered. Future designs require the owner's decision. */
export const DNESKAI_KITS:ReadonlyMap<DneskaiKitId,DneskaiKit>=new Map([[EDITORIAL_KIT.id,EDITORIAL_KIT],[BOLD_KIT.id,BOLD_KIT]]);
export const dneskaiKit=(id:string):DneskaiKit|null=>DNESKAI_KITS.get(id as DneskaiKitId)??null;
