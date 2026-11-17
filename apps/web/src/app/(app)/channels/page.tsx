import { PageHeader } from "@/components/ui";
import { ChannelsBoard } from "@/components/channels-board";
import { describeChannels } from "@/lib/channels";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const channels = await describeChannels();
  const connected = [
    channels.telegram.configured ? "Telegram" : null,
    channels.discord.configured ? "Discord" : null,
  ].filter(Boolean) as string[];

  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="Channels"
        description="Talk to the same agent from Telegram or Discord. Every message starts a normal run, so it shows up in Sessions with its own trace."
        actions={
          <div className="flex items-center gap-2">
            <span className={connected.length > 0 ? "chip chip-ok" : "chip"}>
              {connected.length > 0 ? `${connected.length} connected` : "none connected"}
            </span>
          </div>
        }
      />
      <ChannelsBoard channels={channels} />
    </div>
  );
}
