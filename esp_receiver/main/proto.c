#include "proto.h"
#include <string.h>

uint16_t crc16_ccitt_false(const uint8_t *d, size_t n)
{
    uint16_t crc = 0xFFFF;
    while (n--) {
        crc ^= (uint16_t)(*d++) << 8;
        for (int i = 0; i < 8; i++)
            crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
    }
    return crc;
}

size_t proto_build(uint8_t *out, uint8_t type, uint8_t flags, uint16_t seq,
                   uint8_t dst, const void *payload, uint8_t len)
{
    if (len > PROTO_MAX_PAYLOAD) return 0;
    frame_hdr_t h = { {PROTO_MAGIC0, PROTO_MAGIC1}, PROTO_VERSION, type, flags,
                      seq, ADDR_ROBOT, dst, len };
    memcpy(out, &h, PROTO_HDR_LEN);
    if (len) memcpy(out + PROTO_HDR_LEN, payload, len);
    uint16_t crc = crc16_ccitt_false(out, PROTO_HDR_LEN + len);
    out[PROTO_HDR_LEN + len]     = (uint8_t)(crc & 0xFF);   /* little-endian */
    out[PROTO_HDR_LEN + len + 1] = (uint8_t)(crc >> 8);
    return (size_t)PROTO_HDR_LEN + len + PROTO_CRC_LEN;
}

int proto_parse(const uint8_t *in, size_t n, frame_hdr_t *h, const uint8_t **pl)
{
    if (n < PROTO_HDR_LEN + PROTO_CRC_LEN) return -1;
    memcpy(h, in, PROTO_HDR_LEN);
    if (h->magic[0] != PROTO_MAGIC0 || h->magic[1] != PROTO_MAGIC1) return -2;
    if (h->version != PROTO_VERSION) return -3;
    if ((size_t)PROTO_HDR_LEN + h->payload_len + PROTO_CRC_LEN != n) return -4;
    uint16_t rx  = (uint16_t)(in[n - 2] | (in[n - 1] << 8));
    if (rx != crc16_ccitt_false(in, n - 2)) return -5;
    *pl = in + PROTO_HDR_LEN;
    return 0;
}
