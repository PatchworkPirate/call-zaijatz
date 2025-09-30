<script lang="ts">
	import {
		type ConnectionState,
		RoomEvent,
		type LocalTrack,
		Room,
		type Participant
	} from 'livekit-client';
	import { onMount } from 'svelte';
	import * as _ from 'lodash';
	import { UserIcon } from 'lucide-svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { twMerge } from 'tailwind-merge';
	import Rabbit from '$lib/assets/rabbit.png';
	import { v4 } from 'uuid';

	let localTracks: LocalTrack[] | undefined = $state();

	let jwt: string | undefined = $state();

	const room = new Room();
	let roomState: ConnectionState = $state(room.state);
	let numParticipants: Number = $state(room.numParticipants);
	let remoteParticipants: Map<string, Participant> = new SvelteMap(room.remoteParticipants);
	let activeSpeakers: Participant[] = $state([]);

	room.on(RoomEvent.ConnectionStateChanged, (state) => (roomState = state));

	room.on(RoomEvent.ParticipantConnected, (participant) => {
		numParticipants = room.numParticipants;
		remoteParticipants.set(participant.identity, participant);
	});
	room.on(RoomEvent.ParticipantDisconnected, (participant) => {
		numParticipants = room.numParticipants;
		remoteParticipants.delete(participant.identity);
	});

	room.on(RoomEvent.TrackPublished, (pub, part) => {
		remoteParticipants.set(part.identity, part)
	})

	room.on(RoomEvent.TrackUnpublished, (pub, part) => {
		remoteParticipants.set(part.identity, part)
	})

	room.on(RoomEvent.Connected, async () => {
		console.log('connected to room');

		if (!localTracks) {
			localTracks = await room.localParticipant.createTracks({ audio: true });
		}

		for (const track of localTracks) {
			await room.localParticipant.publishTrack(track);
		}

		room.remoteParticipants.forEach((participant) => {
			remoteParticipants.set(participant.identity, participant);
		});
	});

	room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
		console.log('Track Subbed', track, publication, participant);
	});

	room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
		activeSpeakers = speakers;
	});

	onMount(() => {
		fetch('https://dev.webcomms.net/api/v1/rtc-access', {
			headers: {
				'Content-Type': 'application/json'
			},
			method: 'POST',
			body: JSON.stringify({
				identity: v4(),
				roomName: 'call-zaijatz'
			})
		}).then(async (response) => {
			const data = await response.json();
			jwt = data.jwt;

			console.log('jwt fetched');
		});

		room.localParticipant.createTracks({ audio: true }).then((tracks) => {
			localTracks = tracks;
			console.log('tracks created');
		});
	});
</script>

{#if localTracks}
	{#if roomState === 'disconnected'}
		<div class="flex h-svh flex-col justify-between p-2">
			<div class="flex flex-1 flex-col items-center justify-center">
				<img
					src={Rabbit}
					class="mx-auto flex max-h-64 max-w-64 flex-1 rounded-full"
					alt=""
					srcset=""
				/>
			</div>
			<button
				class="btn btn-primary"
				onclick={async () => {
					if (!jwt) {
						console.error('Invalid JWT', jwt);
						return;
					}
					await room.connect('wss://rtc.webcomms.net', jwt, { autoSubscribe: true });
				}}>Call</button
			>
		</div>
	{:else if roomState === 'connected'}
		<div class="flex h-screen flex-col justify-between p-2">
			<div class="flex flex-1 flex-row flex-wrap items-center justify-evenly gap-4">
				{#if remoteParticipants.size > 0}
					{#each remoteParticipants.values() as participant}
						<div class="flex flex-col items-center">
							<UserIcon
								class={twMerge(
									'm-5 h-24 w-24 rounded-full border-2 border-slate-300 bg-slate-300 text-white transition-all',
									activeSpeakers.map((a) => a.identity).includes(participant.identity) &&
										'border-emerald-500'
								)}
							/>
							<sm class="max-w-24 overflow-clip text-center text-xs text-nowrap text-slate-300"
								>{participant.identity}</sm
							>
							<audio defaultmuted={false} autoplay
								{@attach (audio) => {
									participant.audioTrackPublications.forEach((trackPub) => {
										trackPub.audioTrack?.attach(audio);
									});
								}}
							></audio>
						</div>
					{/each}
				{:else}
					<p class="text-2xl text-slate-300 capitalize">Nobody here</p>
				{/if}
			</div>
			<button
				type="button"
				class="btn btn-error"
				onclick={async () => {
					await room.disconnect(true);
				}}>Disconnect</button
			>
		</div>
	{:else}
		<div class="flex h-screen flex-col justify-between p-2">
			<div class="flex flex-1 flex-col items-center justify-center">
				<img
					src={Rabbit}
					class="mx-auto flex max-h-64 max-w-64 flex-1 rounded-full"
					alt=""
					srcset=""
				/>
			</div>
			<button class="btn btn-primary" disabled>{_.capitalize(roomState)}</button>
		</div>
	{/if}
{:else if !localTracks}
	<p>Allow Mic access</p>
{/if}
