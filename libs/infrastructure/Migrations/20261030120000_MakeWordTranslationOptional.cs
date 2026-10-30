using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using VocaCycle.Infrastructure.Data;

#nullable disable

namespace VocaCycle.Api.Migrations;

[DbContext(typeof(VocaCycleDbContext))]
[Migration("20261030120000_MakeWordTranslationOptional")]
public partial class MakeWordTranslationOptional : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AlterColumn<string>(
            name: "Translation",
            table: "Words",
            type: "text",
            nullable: true,
            oldClrType: typeof(string),
            oldType: "text");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("UPDATE \"Words\" SET \"Translation\" = '' WHERE \"Translation\" IS NULL;");
        migrationBuilder.AlterColumn<string>(
            name: "Translation",
            table: "Words",
            type: "text",
            nullable: false,
            oldClrType: typeof(string),
            oldType: "text",
            oldNullable: true);
    }
}
