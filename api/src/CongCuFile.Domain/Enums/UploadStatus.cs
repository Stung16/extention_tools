namespace CongCuFile.Domain.Enums;

public enum UploadStatus
{
    Waiting,   // đã cấp link tải lên, chưa nhận đủ file
    Uploaded,  // đã nhận đủ file
}
