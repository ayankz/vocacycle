using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VocaCycle.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionGeneration : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Translation",
                table: "WordExamples",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContentJson",
                table: "AudioSessionWords",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AudioUrl",
                table: "AudioSessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "DurationMs",
                table: "AudioSessions",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Error",
                table: "AudioSessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ExamplesPerWord",
                table: "AudioSessions",
                type: "integer",
                nullable: false,
                defaultValue: 5);

            migrationBuilder.AddColumn<Guid>(
                name: "RequestId",
                table: "AudioSessions",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Stage",
                table: "AudioSessions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SynthesisClaimsJson",
                table: "AudioSessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TimelineJson",
                table: "AudioSessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                table: "AudioSessions",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.Sql("""
                UPDATE "AudioSessions"
                SET "UpdatedAt" = "CreatedAt",
                    "Stage" = CASE WHEN "Status" = 'pending' THEN 'queued' ELSE "Status" END;
                """);

            migrationBuilder.CreateIndex(
                name: "IX_AudioSessions_RequestId",
                table: "AudioSessions",
                column: "RequestId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AudioSessions_RequestId",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "Translation",
                table: "WordExamples");

            migrationBuilder.DropColumn(
                name: "ContentJson",
                table: "AudioSessionWords");

            migrationBuilder.DropColumn(
                name: "AudioUrl",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "DurationMs",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "Error",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "ExamplesPerWord",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "RequestId",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "Stage",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "SynthesisClaimsJson",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "TimelineJson",
                table: "AudioSessions");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "AudioSessions");
        }
    }
}
