const events = require("events");

const { DiscordVoiceAdapter } = require("@dasha.ai/discord");
const dasha = require("@dasha.ai/sdk");
const discord = require("discord.js");
const winston = require("winston");

require("dotenv/config");

const log = winston.createLogger({
  transports: new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.printf(
        ({ timestamp, label, level, message, stack }) =>
          `${timestamp} [${label ?? "app"}] ${level} ${stack ?? message}`
      )
    ),
  }),
});

dasha.log.clear();
dasha.log.add(log);

async function main() {
  log.info("logging into discord");

  const discordClient = new discord.Client();
  await discordClient.login(process.env.DISCORD_BOT_TOKEN);

  log.info("deploying the dasha application");

  const dashaApp = await dasha.deploy(`${__dirname}/app`);

  dashaApp.connectionProvider = () => dasha.audio.connect();

  dashaApp.incoming.on("request", async (endpoint, additionalInfo) => {
    const { discordTextChannelId, discordMessageId } = JSON.parse(additionalInfo);

    const conv = dashaApp.createConversation({ endpoint });

    /** @type discord.TextChannel */
    const discordTextChannel = await discordClient.channels.fetch(discordTextChannelId);

    const discordMessage = await discordTextChannel.messages.fetch(discordMessageId);

    conv.on("transcription", async (t) => {
      discordMessage.reply(`${t.speaker}: ${t.text}`);
    });

    await conv.execute();
  });

  log.info("starting the dasha application");

  await dashaApp.start();

  log.info("setting up command handlers");

  discordClient.on("message", async (message) => {
    if (message.author === discordClient.user) return;

    if (message.channel === message.author.dmChannel || message.mentions.has(discordClient.user)) {
      message.reply("Use the `/dasha start` command in any text channel to start a convo.");
      return;
    }

    if (message.content === "/dasha start") {
      log.info("got a /dasha start command");

      if (!message.guild) {
        await message.reply("Voice only works in guilds.");
        return;
      }

      const discordVoiceChannel = message.member.voice.channel;

      if (!discordVoiceChannel) {
        await message.reply("You need to join a voice channel first!");
        return;
      }

      const dashaAudioClientAccount = await dashaApp.getAudioClientAccount();
      const dashaAudioChannel = await dasha.audioClient.connect(dashaAudioClientAccount, {
        additionalInfo: JSON.stringify({
          discordTextChannelId: message.channel.id,
          discordMessageId: message.id,
        }),
      });

      log.info("connecting");

      const dashaDiscordAdapter = new DiscordVoiceAdapter(dashaAudioChannel, discordVoiceChannel);

      log.info("waiting for conversation to end");

      await events.once(dashaAudioChannel, "close");

      log.info("cleaning up");

      dashaDiscordAdapter.close();
    }
  });

  log.info("waiting for a /dasha start");
}

main().catch(log.error);
