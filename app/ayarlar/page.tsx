import { SettingsPage } from "@/components/settings-page";
import { version } from "@/package.json";
export default function Page() { return <SettingsPage version={version}/>; }
