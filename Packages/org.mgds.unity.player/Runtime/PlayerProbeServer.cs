using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace Mgds.Unity.Player
{
    public sealed class PlayerProbeServer : IDisposable
    {
        readonly PlayerProbeSession session;
        TcpListener listener;
        Thread thread;
        volatile bool stopping;

        public PlayerProbeServer(PlayerProbeSession session) => this.session = session ?? throw new ArgumentNullException(nameof(session));
        public int Port { get; private set; }

        public void Start()
        {
            if (listener != null) throw new InvalidOperationException("Probe server already started.");
            listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start(1);
            Port = ((IPEndPoint)listener.LocalEndpoint).Port;
            thread = new Thread(AcceptLoop) { IsBackground = true, Name = "MGDS Player Probe" };
            thread.Start();
        }

        public void Stop()
        {
            if (stopping) return;
            stopping = true;
            listener?.Stop();
            if (thread != null && thread.IsAlive) thread.Join(2000);
            session.Close();
            listener = null;
            thread = null;
        }

        void AcceptLoop()
        {
            while (!stopping)
            {
                try
                {
                    using var client = listener.AcceptTcpClient();
                    client.ReceiveTimeout = 2000;
                    client.SendTimeout = 2000;
                    Handle(client.GetStream());
                }
                catch (SocketException) when (stopping) { return; }
                catch (ObjectDisposedException) when (stopping) { return; }
                catch { /* A malformed client never terminates the bounded listener. */ }
            }
        }

        void Handle(NetworkStream stream)
        {
            var request = ReadBoundedLine(stream, 4096);
            var fields = request.Split('\t');
            string response;
            try
            {
                if (fields.Length != 2) throw new InvalidDataException("Two request fields required.");
                response = $"ok\t{session.Authorize(fields[0], fields[1])}\n";
            }
            catch { response = "error\trejected\n"; }
            var bytes = Encoding.UTF8.GetBytes(response);
            stream.Write(bytes, 0, bytes.Length);
        }

        static string ReadBoundedLine(Stream stream, int limit)
        {
            var bytes = new byte[limit];
            var count = 0;
            while (count < limit)
            {
                var value = stream.ReadByte();
                if (value < 0) throw new EndOfStreamException();
                if (value == '\n') return new UTF8Encoding(false, true).GetString(bytes, 0, count).TrimEnd('\r');
                bytes[count++] = (byte)value;
            }
            throw new InvalidDataException("Probe request exceeds byte limit.");
        }

        public void Dispose() => Stop();
    }
}
