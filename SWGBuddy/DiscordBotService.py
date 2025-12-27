"""

Discord Bot Service Module
--------------------------

Bridges the gap between the Backend IPC (Synchronous) and Discord (Asynchronous).
Handles:
1. Alerts: Consumes IPC messages and posts to subscribed channels.
2. Commands: Handles /subscribe and /unsubscribe slash commands.

"""
import os
import asyncio
import threading
import discord
from discord import app_commands
from queue import Empty

# Local Imports
from core.ipc import create_packet
from core.core import Core

class DiscordBotService(Core):
    def __init__(self, input_queue, ingress_queue):
        super().__init__()
        self.input_queue = input_queue     # Messages FROM Backend (Alerts)
        self.ingress_queue = ingress_queue # Messages TO Backend (Commands)
        self.running = True
        self.loop = None
        
        # Discord Config
        self.token = os.getenv("DISCORD_TOKEN")
        self.guild_id = os.getenv("DISCORD_GUILD_ID") # Optional: For instant command sync
        
        # Initialize Client
        intents = discord.Intents.default()
        self.client = discord.Client(intents=intents)
        self.tree = app_commands.CommandTree(self.client)

        # ------------------------------------------------------------------
        # BOT EVENTS
        # ------------------------------------------------------------------
        @self.client.event
        async def on_ready():
            self.info(f"Discord Bot Logged in as {self.client.user}")
            # Sync Slash Commands
            if self.guild_id:
                guild = discord.Object(id=self.guild_id)
                self.tree.copy_global_to(guild=guild)
                await self.tree.sync(guild=guild)
            else:
                await self.tree.sync()
            self.info("Slash Commands Synced")

        # ------------------------------------------------------------------
        # SLASH COMMANDS
        # ------------------------------------------------------------------
        @self.tree.command(name="subscribe", description="Subscribe this channel to resource alerts")
        @app_commands.describe(server="The Game Server to watch (e.g. cuemu)")
        async def subscribe(interaction: discord.Interaction, server: str):
            # 1. Security Check
            if not interaction.user.guild_permissions.manage_guild:
                await interaction.response.send_message("You need 'Manage Server' permissions.", ephemeral=True)
                return

            # 2. Send IPC to Database
            # We construct a SQL query to insert the subscription
            channel_id = str(interaction.channel_id)
            guild_id = str(interaction.guild_id)
            
            sql = """
                INSERT INTO discord_subscriptions (guild_id, channel_id, server_id) 
                VALUES (%s, %s, %s)
                ON CONFLICT (channel_id, server_id) DO NOTHING
            """
            
            # Send to Backend
            packet = create_packet(
                target="db",
                action="execute",
                data={"sql": sql, "params": (guild_id, channel_id, server)},
                server_id=server
            )
            self.ingress_queue.put(packet)
            
            await interaction.response.send_message(f"✅ Subscribed <#{channel_id}> to **{server}** alerts.")

    def start(self):
        """
        Starts the Bot in a separate thread to keep MainProcess unblocked.
        """
        if not self.token:
            self.error("No DISCORD_TOKEN found. Bot Service disabled.")
            return

        self.info("Starting Discord Bot Service...")
        self.bot_thread = threading.Thread(target=self._run_bot, daemon=True)
        self.bot_thread.start()

    def _run_bot(self):
        """
        Entry point for the Bot Thread.
        """
        # Create a new event loop for this thread
        self.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self.loop)
        
        # Start the IPC Consumer in the background of this loop
        self.loop.create_task(self._ipc_consumer())
        
        # Run the Bot (Blocking call for this thread)
        try:
            self.client.run(self.token)
        except Exception as e:
            self.critical(f"Discord Bot Crashed: {e}")

    async def _ipc_consumer(self):
        """
        Async task that polls the Queue for alerts.
        """
        self.info("IPC Consumer Task Started")
        while self.running:
            try:
                # Non-blocking check of the queue
                # We use a small sleep to prevent CPU spiking since Queue is not async
                try:
                    packet = self.input_queue.get_nowait()
                except Empty:
                    await asyncio.sleep(0.5)
                    continue

                await self._handle_packet(packet)

            except Exception as e:
                self.error(f"IPC Consumer Error: {e}")
                await asyncio.sleep(1)

    async def _handle_packet(self, packet):
        """
        Process incoming alerts and route to channels.
        """
        action = packet.get('action')
        server_id = packet.get('server_id')
        payload = packet.get('payload') # The Resource Data

        if action == "new_resource":
            self.info(f"Broadcasting Alert for {server_id}")
            # 1. Ask DB who is subscribed (Or use local cache if implemented)
            # For MVP, we will query DB every time or implement a cache later.
            # Ideally, ValidationService should attach the list of channel_ids 
            # OR we maintain a subscription cache here.
            
            # Let's assume for now we broadcast to a debug channel or implement the cache lookup.
            # TODO: Implement Subscription Cache lookup here.
            pass

    def stop(self):
        self.running = False
        if self.client:
            asyncio.run_coroutine_threadsafe(self.client.close(), self.loop)