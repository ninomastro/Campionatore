export interface ActiveRecording {
  stop(): Promise<Blob>;
}

export async function requestMicStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

export function startRecording(stream: MediaStream): ActiveRecording {
  const mediaRecorder = new MediaRecorder(stream);
  const chunks: BlobPart[] = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const stopped = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => {
      // Le tracce vanno fermate solo dopo che il recorder ha finito di scrivere
      // l'ultimo chunk, altrimenti il blob risulta troncato e non decodificabile.
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: mediaRecorder.mimeType }));
    };
  });

  mediaRecorder.start();

  return {
    stop: () => {
      mediaRecorder.stop();
      return stopped;
    },
  };
}
