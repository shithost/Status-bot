require('dotenv').config();
const axios = require('axios');
const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const discordToken = process.env.DISCORD_BOT_TOKEN;
const panelUrl = process.env.PANEL_URL;
const apiKey = process.env.API_KEY;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ],
});

const commands = [
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('List all nodes and their status, and the server with the most CPU allocated'),
];

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.once('ready', async () => {
    try {
        await client.application.commands.set(commands);
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'setup') {
        await interaction.reply({ content: 'Fetching nodes and servers...', ephemeral: true });

        let message = await interaction.channel.send({ content: 'Fetching nodes and servers...' });

        const updateNodesAndServers = async () => {
            try {
                const nodesResponse = await axios.get(`${panelUrl}/api/application/nodes`, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'Application/vnd.pterodactyl.v1+json',
                    },
                });

                const serversResponse = await axios.get(`${panelUrl}/api/application/servers`, {
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'Accept': 'Application/vnd.pterodactyl.v1+json',
                    },
                });

                const nodes = nodesResponse.data.data;
                const servers = serversResponse.data.data;

                const serverDetails = await Promise.all(servers.map(async server => {
                    const serverDetailsResponse = await axios.get(`${panelUrl}/api/application/servers/${server.attributes.id}`, {
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json',
                            'Accept': 'Application/vnd.pterodactyl.v1+json',
                        },
                    });
                    return {
                        name: server.attributes.name,
                        cpu: serverDetailsResponse.data.attributes.limits.cpu,
                        disk: serverDetailsResponse.data.attributes.limits.disk,
                        memory: serverDetailsResponse.data.attributes.limits.memory,
                        owner: server.attributes.user,
                    };
                }));

                const mostCpuServer = serverDetails.reduce((prev, current) => (prev.cpu > current.cpu ? prev : current), serverDetails[0]);
                const mostDiskServer = serverDetails.reduce((prev, current) => (prev.disk > current.disk ? prev : current), serverDetails[0]);
                const mostRamServer = serverDetails.reduce((prev, current) => (prev.memory > current.memory ? prev : current), serverDetails[0]);

                const embed = new EmbedBuilder()
                    .setTitle('Status')
                    .setColor(0x0099ff)
                    .setTimestamp();

                nodes.forEach(node => {
                    const nodeStatus = node.attributes.is_under_maintenance ? 'Under Maintenance' : 'Online';
                    embed.addFields(
                        { name: node.attributes.name, value: nodeStatus, inline: true }
                    );
                });

                embed.addFields(
                    {
                        name: 'Server with Most Resources',
                        value: `CPU: ${mostCpuServer.name} - ${mostCpuServer.cpu}\nDisk: ${mostDiskServer.name} - ${mostDiskServer.disk}\nRAM: ${mostRamServer.name} - ${mostRamServer.memory}`,
                        inline: false
                    },
                    {
                        name: 'Server Owners',
                        value: `CPU: ${mostCpuServer.owner}\nDisk: ${mostDiskServer.owner}\nRAM: ${mostRamServer.owner}`,
                        inline: false
                    }
                );

                if (message.editable) {
                    await message.edit({ content: '', embeds: [embed] });
                } else {
                    message = await interaction.channel.send({ embeds: [embed] });
                }
            } catch (error) {
                console.error('Error fetching nodes or servers:', error.response ? error.response.data : error.message);
                if (message.editable) {
                    await message.edit({ content: 'Error fetching nodes or servers. Please try again later.' });
                }
            }
        };

        await updateNodesAndServers();

        const intervalId = setInterval(updateNodesAndServers, 5000);

        interaction.channel.createMessageCollector({ time: 300000 }).on('end', () => {
            clearInterval(intervalId);
            console.log('Node and server status updates stopped.');
        });
    }
});

client.login(discordToken);